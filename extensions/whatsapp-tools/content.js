(function () {
  'use strict';

  // Loja: Av. Exemplo, 1000, Centro, São Paulo - SP (01000-002).
  // Coordenadas conferidas por reverse-geocode nessa avenida/bairro.
  const STORE_LAT = -23.4565216;
  const STORE_LNG = -46.5652009;
  const STORE_NAME = 'Armarinho Aurora';
  const PAINEL_DEFAULT = 'https://painel.armarinhoaurora.com.br';

  let ultimoHeader = null;

  function urlValida(url) {
    return url && !url.includes('homolog') && !url.includes('/painel');
  }

  function getPainelUrl(cb) {
    chrome.storage.sync.get({ painelUrl: PAINEL_DEFAULT }, (s) => {
      const url = urlValida(s.painelUrl) ? s.painelUrl : PAINEL_DEFAULT;
      if (url !== s.painelUrl) chrome.storage.sync.set({ painelUrl: url });
      cb(url);
    });
  }

  // ── Pedidos salvos (telefone → [códigos]) ─────────────────────────────────
  // A gravação é feita pelo content-painel.js na aba do painel. Aqui só lemos
  // e reagimos a mudanças no storage para atualizar as etiquetas ao vivo.
  function getPedidos(cb) {
    chrome.storage.local.get({ pedidos: {} }, (s) => cb(s.pedidos));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pedidos) atualizarEtiquetas();
  });

  // ── Abrir conversa a partir do painel ─────────────────────────────────────
  // O background foca esta aba e manda abrir o chat. Tenta pela API interna
  // (sem recarregar); se falhar em ~1.5s, navega via send?phone (recarrega).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'CP_OPEN_CHAT_TAB') return;
    const phone = String(msg.phone || '').replace(/\D/g, '');
    if (!phone) return;

    let respondido = false;
    const fallback = () => {
      window.location.href = `https://web.whatsapp.com/send?phone=${phone}`;
    };
    const onMsg = (e) => {
      if (e.source === window && e.data?.type === 'CP_OPEN_CHAT_RESULT') {
        respondido = true;
        window.removeEventListener('message', onMsg);
        if (!e.data.ok) fallback();
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'CP_OPEN_CHAT_MAIN', phone }, '*');
    setTimeout(() => {
      if (respondido) return;
      window.removeEventListener('message', onMsg);
      fallback();
    }, 1500);
  });

  // Espera a caixa de mensagem aparecer, digita o texto e clica em enviar.
  function enviarViaCompose(texto) {
    return new Promise((resolve) => {
      let tentativas = 0;
      const tick = () => {
        const box =
          document.querySelector('#main footer div[contenteditable="true"]') ||
          document.querySelector('footer div[contenteditable="true"][data-tab]') ||
          document.querySelector('#main div[contenteditable="true"][role="textbox"]');
        if (box) {
          box.focus();
          // insertText dispara o onChange do editor do WhatsApp (React/Lexical).
          document.execCommand('insertText', false, texto);
          setTimeout(() => {
            const btn =
              document.querySelector('#main footer [data-icon="send"]')?.closest('button') ||
              document
                .querySelector('#main footer [data-icon="wds-ic-send-filled"]')
                ?.closest('button') ||
              document.querySelector('button[aria-label="Enviar"], button[aria-label="Send"]');
            if (btn) {
              btn.click();
              resolve(true);
            } else {
              resolve(false);
            }
          }, 200);
          return;
        }
        if (++tentativas > 25) {
          resolve(false);
          return;
        }
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  // Enviar mensagem: abre a conversa (sem reload) e envia pela caixa de texto.
  // Se não conseguir, navega via send?phone&text (recarrega, texto na caixa).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'CP_SEND_MSG_TAB') return;
    const phone = String(msg.phone || '').replace(/\D/g, '');
    const texto = msg.texto || '';
    if (!phone || !texto) return;

    const fallback = () => {
      const p = phone.startsWith('55') ? phone : '55' + phone;
      window.location.href = `https://web.whatsapp.com/send?phone=${p}&text=${encodeURIComponent(texto)}`;
    };

    let aberto = false;
    const onOpen = (e) => {
      if (e.source === window && e.data?.type === 'CP_OPEN_CHAT_RESULT') {
        aberto = true;
        window.removeEventListener('message', onOpen);
        if (!e.data.ok) {
          fallback();
          return;
        }
        enviarViaCompose(texto).then((ok) => {
          if (!ok) fallback();
        });
      }
    };
    window.addEventListener('message', onOpen);
    window.postMessage({ type: 'CP_OPEN_CHAT_MAIN', phone }, '*');
    setTimeout(() => {
      if (aberto) return;
      window.removeEventListener('message', onOpen);
      fallback();
    }, 1800);
  });

  // ── Extração de nome ──────────────────────────────────────────────────────
  function extrairNome() {
    // Seletor estável: data-testid presente no span do título da conversa
    const byTestid = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
    if (byTestid) {
      const v = byTestid.textContent.trim();
      if (v) return v;
    }

    const header =
      document.querySelector('[data-testid="conversation-header"]') ||
      document.querySelector('#main header');

    if (header) {
      // span com dir="auto" é exclusivo do nome do contato (suporte bidirecional)
      const byDir = header.querySelector('span[dir="auto"]');
      if (byDir) {
        const v = byDir.textContent.trim();
        if (v && !v.toLowerCase().includes('clique')) return v;
      }
      // fallback: spans com title não vazio, filtrando textos de status
      for (const span of header.querySelectorAll('span[title]')) {
        const v = span.getAttribute('title').trim();
        if (v && !v.toLowerCase().includes('clique') && !v.includes('online')) {
          return v;
        }
      }
    }

    return '';
  }

  // ── Nome + telefone via content-main.js (mundo MAIN, sem bloqueio de CSP) ──
  function getActiveChat() {
    return new Promise((resolve) => {
      const reqId = 'cp-' + Date.now();

      const onMsg = (e) => {
        if (e.source === window && e.data?.type === 'CP_PHONE_RESULT' && e.data?.reqId === reqId) {
          window.removeEventListener('message', onMsg);
          resolve({ nome: e.data.nome || '', phone: e.data.phone || '' });
        }
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'CP_GET_PHONE', reqId }, '*');
      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve({ nome: '', phone: '' });
      }, 600);
    });
  }

  // Lista de chats (título + telefone) via content-main.js, para casar a lista lateral.
  function getChats() {
    return new Promise((resolve) => {
      const reqId = 'cpc-' + Date.now();
      const onMsg = (e) => {
        if (e.source === window && e.data?.type === 'CP_CHATS_RESULT' && e.data?.reqId === reqId) {
          window.removeEventListener('message', onMsg);
          resolve(e.data.chats || []);
        }
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'CP_GET_CHATS', reqId }, '*');
      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve([]);
      }, 800);
    });
  }

  // Remove o código do país 55 — a máscara do painel espera DDD + número (10-11 dígitos).
  function limparTelefone(raw) {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    return d;
  }

  // Se não há letra, o "nome" é só o número do contato não salvo — não serve como nome.
  function nomeReal(nome) {
    return /[a-zA-ZÀ-ÿ]/.test(nome) ? nome.trim() : '';
  }

  // ── Extração de telefone (DOM, síncrono) ──────────────────────────────────
  function extrairTelefoneDom() {
    // Se o nome for um número de telefone (contato não salvo)
    const nome = extrairNome();
    const digits = nome.replace(/\D/g, '');
    if (/^\d{10,15}$/.test(digits)) return digits;
    return '';
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  function btnCss(bg, fg) {
    return (
      `background:${bg};color:${fg};border:none;border-radius:6px;` +
      `padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;` +
      `white-space:nowrap;line-height:1;font-family:inherit;`
    );
  }

  // ── Overlay do Uber ───────────────────────────────────────────────────────
  function abrirOverlayUber() {
    if (document.getElementById('cp-uber-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'cp-uber-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:360px;
                  box-shadow:0 8px 32px rgba(0,0,0,.25);font-family:system-ui,sans-serif;">
        <h3 style="margin:0 0 4px;font-size:16px;font-weight:700;color:#111;">
          Calcular entrega Uber
        </h3>
        <p style="margin:0 0 16px;font-size:13px;color:#666;">
          Endereço ou CEP de entrega do cliente
        </p>
        <input id="cp-uber-addr" type="text" autocomplete="off"
          placeholder="Endereço ou CEP (ex: 01000-002)"
          style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #ddd;
                 border-radius:8px;font-size:14px;outline:none;margin-bottom:8px;"/>
        <div id="cp-uber-sugs" style="display:none;border:1px solid #e5e5e5;border-radius:8px;
             max-height:190px;overflow-y:auto;margin-bottom:10px;"></div>
        <p id="cp-uber-status" style="margin:0 0 10px;font-size:12px;color:#dc2626;min-height:16px;"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="cp-uber-cancel"
            style="padding:8px 16px;border:1px solid #ddd;background:#fff;
                   border-radius:6px;cursor:pointer;font-size:13px;">
            Cancelar
          </button>
          <button id="cp-uber-ok"
            style="padding:8px 16px;background:#111;color:#fff;border:none;
                   border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
            Abrir Uber
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const input = document.getElementById('cp-uber-addr');
    input.focus();

    const status = document.getElementById('cp-uber-status');
    const btnOk = document.getElementById('cp-uber-ok');
    const sugs = document.getElementById('cp-uber-sugs');
    const fechar = () => overlay.remove();

    let selecionado = null; // { lat, lon, display } da sugestão escolhida
    let sugTimer = null;

    // lat/lon null → manda só o texto e deixa o Uber geocodificar (número exato).
    function abrirUber(lat, lon, label) {
      const pickup = JSON.stringify({
        latitude: Number(STORE_LAT),
        longitude: Number(STORE_LNG),
        addressLine1: STORE_NAME,
      });
      const dropObj = { addressLine1: label };
      if (lat != null && lat !== '' && lon != null && lon !== '') {
        dropObj.latitude = Number(lat);
        dropObj.longitude = Number(lon);
      }
      const uberUrl =
        'https://m.uber.com/looking?pickup=' +
        encodeURIComponent(pickup) +
        '&drop[0]=' +
        encodeURIComponent(JSON.stringify(dropObj));
      window.open(uberUrl, '_blank');
      fechar();
    }

    function renderSugs(results) {
      sugs.innerHTML = '';
      if (!results.length) {
        sugs.style.display = 'none';
        return;
      }
      sugs.style.display = 'block';
      results.forEach((r) => {
        const item = document.createElement('div');
        item.textContent = r.display;
        item.style.cssText =
          'padding:8px 10px;font-size:12px;color:#222;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        item.addEventListener('mouseenter', () => (item.style.background = '#f5f5f5'));
        item.addEventListener('mouseleave', () => (item.style.background = '#fff'));
        item.addEventListener('click', () => {
          selecionado = { lat: r.lat, lon: r.lon, display: r.display };
          input.value = r.display;
          renderSugs([]);
          input.style.border = '1px solid #1B3A8C';
        });
        sugs.appendChild(item);
      });
    }

    // Autocomplete: busca sugestões enquanto digita (com debounce).
    input.addEventListener('input', () => {
      selecionado = null;
      status.textContent = '';
      input.style.border = '1px solid #ddd';
      const termo = input.value.trim();
      clearTimeout(sugTimer);
      if (termo.length < 4) {
        renderSugs([]);
        return;
      }
      sugTimer = setTimeout(() => {
        // CEP (8 dígitos) → base postal (AwesomeAPI); senão → Nominatim.
        const cep = termo.replace(/\D/g, '');
        const msg = /^\d{8}$/.test(cep)
          ? { type: 'CP_CEP', cep }
          : { type: 'CP_GEOCODE', query: `${termo}, SP, Brasil`, limit: 6 };
        chrome.runtime.sendMessage(msg, (resp) => {
          if (input.value.trim() !== termo) return; // termo mudou, ignora
          renderSugs((resp && resp.results) || []);
        });
      }, 350);
    });

    document.getElementById('cp-uber-cancel').addEventListener('click', fechar);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar();
    });

    btnOk.addEventListener('click', () => {
      const addr = input.value.trim();
      if (!addr) {
        input.style.border = '1px solid red';
        return;
      }
      // Se escolheu uma sugestão, usa as coordenadas dela direto.
      if (selecionado) {
        abrirUber(selecionado.lat, selecionado.lon, selecionado.display);
        return;
      }
      // CEP digitado: resolve pela base postal (coordenadas confiáveis).
      const cep = addr.replace(/\D/g, '');
      if (/^\d{8}$/.test(cep)) {
        status.style.color = '#666';
        status.textContent = 'Buscando CEP…';
        btnOk.disabled = true;
        chrome.runtime.sendMessage({ type: 'CP_CEP', cep }, (resp) => {
          btnOk.disabled = false;
          const r = resp && resp.results && resp.results[0];
          if (!r) {
            status.style.color = '#dc2626';
            status.textContent = 'CEP não encontrado.';
            return;
          }
          abrirUber(r.lat, r.lon, r.display);
        });
        return;
      }
      // Endereço manual: geocodifica via Nominatim (o Uber exige coordenadas).
      status.style.color = '#666';
      status.textContent = 'Buscando endereço…';
      btnOk.disabled = true;
      chrome.runtime.sendMessage(
        { type: 'CP_GEOCODE', query: `${addr}, SP, Brasil`, limit: 1 },
        (resp) => {
          btnOk.disabled = false;
          const r = resp && resp.results && resp.results[0];
          if (!r) {
            status.style.color = '#dc2626';
            status.textContent = 'Endereço não encontrado. Tente ser mais específico.';
            return;
          }
          abrirUber(r.lat, r.lon, addr);
        },
      );
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'Enter') btnOk.click(); // submete o texto digitado
    });
  }

  // ── Etiquetas de pedido ───────────────────────────────────────────────────
  function pilulaCss() {
    return (
      'display:inline-flex;align-items:center;gap:3px;background:#1B3A8C;color:#fff;' +
      'border-radius:10px;padding:2px 8px;font-size:11px;font-weight:600;' +
      'white-space:nowrap;font-family:inherit;line-height:1.4;cursor:pointer;'
    );
  }

  // Torna a pílula clicável: abre o card do pedido no painel. stopPropagation
  // evita que o clique também abra a conversa (na lista lateral).
  function tornarClicavel(pill, code) {
    pill.title = 'Abrir pedido ' + code;
    pill.addEventListener('mousedown', (ev) => ev.stopPropagation());
    pill.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    pill.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      getPainelUrl((painel) => window.open(`${painel}/pedidos/${code}`, '_blank'));
    });
  }

  // Etiqueta no header da conversa aberta. Idempotente: só mexe no DOM quando
  // o conteúdo muda — senão o MutationObserver reentra e vira loop infinito.
  async function renderEtiquetaHeader() {
    if (!document.getElementById('cp-wapp-tools')) return;

    const chat = await getActiveChat();
    const fone = limparTelefone(extrairTelefoneDom() || chat.phone);

    getPedidos((pedidos) => {
      // Re-busca o wrap: durante o await o header pode ter sido recriado.
      const wrap = document.getElementById('cp-wapp-tools');
      if (!wrap) return;
      const codes = (fone && pedidos[fone]) || [];
      const sig = codes.join(',');
      const existente = wrap.querySelector('#cp-etq-header');
      if (existente && existente.dataset.sig === sig) return; // já correto
      if (existente) existente.remove();
      if (!codes.length) return;

      const cont = document.createElement('div');
      cont.id = 'cp-etq-header';
      cont.dataset.sig = sig;
      cont.style.cssText = 'display:flex;gap:4px;align-items:center;';
      codes.forEach((code) => {
        const pill = document.createElement('span');
        pill.style.cssText = pilulaCss();
        pill.textContent = '📦 ' + code;
        tornarClicavel(pill, code);
        cont.appendChild(pill);
      });
      wrap.insertBefore(cont, wrap.firstChild);
    });
  }

  // Etiqueta nas conversas da lista lateral. Também idempotente por linha.
  async function renderEtiquetaSidebar() {
    const pane = document.getElementById('pane-side');
    if (!pane) return;

    getPedidos(async (pedidos) => {
      const temPedidos = Object.keys(pedidos).length > 0;
      const chats = temPedidos ? await getChats() : [];
      const tituloParaFone = {};
      chats.forEach((c) => {
        if (c.title) tituloParaFone[c.title.trim().toLowerCase()] = limparTelefone(c.phone);
      });

      // Remove etiquetas órfãs (linhas fantasma da virtualização, sem list-item).
      pane.querySelectorAll('.cp-etq-side').forEach((el) => {
        if (!el.closest('[role="row"][data-testid^="list-item"]')) el.remove();
      });

      // A lista é uma grade virtualizada: linhas reais têm data-testid="list-item-*".
      pane.querySelectorAll('[role="row"][data-testid^="list-item"]').forEach((row) => {
        const titleEl = row.querySelector('span[title]') || row.querySelector('span[dir="auto"]');
        const titulo = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
        if (!titulo) return;
        let fone = tituloParaFone[titulo.toLowerCase()];
        if (!fone) {
          const d = limparTelefone(titulo);
          if (/^\d{10,15}$/.test(d)) fone = d;
        }
        const codes = (fone && pedidos[fone]) || [];
        const sig = codes.length
          ? '📦 ' + codes[codes.length - 1] + (codes.length > 1 ? ' +' + (codes.length - 1) : '')
          : '';

        const existente = row.querySelector('.cp-etq-side');
        if (existente && existente.dataset.sig === sig) return; // já correto
        if (existente) existente.remove();
        if (!sig) return;

        const pill = document.createElement('span');
        pill.className = 'cp-etq-side';
        pill.dataset.sig = sig;
        // O transform da row é o bloco de contenção — absolute ancora na linha.
        pill.style.cssText =
          pilulaCss() +
          'position:absolute;right:12px;bottom:10px;font-size:10px;padding:1px 6px;z-index:5;';
        pill.textContent = sig;
        tornarClicavel(pill, codes[codes.length - 1]); // abre o pedido mais recente
        row.appendChild(pill);
      });
    });
  }

  let etqTimer = null;
  function atualizarEtiquetas() {
    clearTimeout(etqTimer);
    etqTimer = setTimeout(() => {
      renderEtiquetaHeader();
      renderEtiquetaSidebar();
    }, 250);
  }

  // ── Injeção dos botões ────────────────────────────────────────────────────
  function injetarBotoes(header) {
    if (header.querySelector('#cp-wapp-tools')) return;

    const wrap = document.createElement('div');
    wrap.id = 'cp-wapp-tools';
    wrap.style.cssText =
      'display:flex;gap:6px;align-items:center;margin-left:auto;padding:0 8px;flex-shrink:0;';

    // Botão 1: Iniciar Pedido
    const btnPedido = document.createElement('button');
    btnPedido.textContent = '📦 Pedido';
    btnPedido.style.cssText = btnCss('#1B3A8C', '#fff');
    btnPedido.title = 'Iniciar pedido para este contato';
    btnPedido.addEventListener('click', async () => {
      const chat = await getActiveChat();
      // Nome: título do DOM (contato salvo) → nome da store (loja/business)
      let nome = nomeReal(extrairNome());
      if (!nome) nome = nomeReal(chat.nome);
      // Telefone: dígitos do título (não salvo) → JID da store
      const fone = limparTelefone(extrairTelefoneDom() || chat.phone);
      getPainelUrl((painel) => {
        const url = new URL(`${painel}/pedidos`);
        url.searchParams.set('novo', '1');
        if (nome) url.searchParams.set('nome', nome);
        if (fone) url.searchParams.set('fone', fone);
        window.open(url.toString(), '_blank');
      });
    });

    // Botão 2: Calcular Uber
    const btnUber = document.createElement('button');
    btnUber.textContent = '🚗 Uber';
    btnUber.style.cssText = btnCss('#111', '#fff');
    btnUber.title = 'Calcular entrega via Uber';
    btnUber.addEventListener('click', abrirOverlayUber);

    wrap.appendChild(btnPedido);
    wrap.appendChild(btnUber);

    // Inserir antes do último grupo de ícones do header (evita sobrepor botões nativos)
    const ultimoFilho = header.lastElementChild;
    if (ultimoFilho) {
      header.insertBefore(wrap, ultimoFilho);
    } else {
      header.appendChild(wrap);
    }
  }

  function tentarInjetar() {
    // SOMENTE o header da conversa (#main). O fallback genérico <header> pegava
    // também o header da barra lateral, duplicando os botões na borda esquerda.
    const header =
      document.querySelector('#main [data-testid="conversation-header"]') ||
      document.querySelector('#main header');

    if (!header) return;
    if (header === ultimoHeader) return;
    ultimoHeader = header;
    injetarBotoes(header);
  }

  // ── Observer ──────────────────────────────────────────────────────────────
  function onMutate() {
    tentarInjetar();
    atualizarEtiquetas();
  }
  tentarInjetar();
  atualizarEtiquetas();
  const obs = new MutationObserver(onMutate);
  obs.observe(document.body, { childList: true, subtree: true });
})();
