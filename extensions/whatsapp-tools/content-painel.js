// Roda na página do painel administrativo (mundo isolado, tem chrome.storage).
// Escuta o aviso de pedido criado (postMessage na mesma aba) e grava
// telefone → códigos no storage, que a aba do WhatsApp lê para montar a etiqueta.
(function () {
  'use strict';

  function normFone(raw) {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    return d;
  }

  // Marca presença da extensão para o painel decidir o comportamento do botão.
  document.documentElement.setAttribute('data-cp-ext', '1');

  window.addEventListener('message', (e) => {
    // Abrir conversa: pede ao background pra focar a aba do WhatsApp e abrir o chat.
    if (e.data?.type === 'CP_ABRIR_CONVERSA') {
      const fone = normFone(e.data.phone);
      if (fone) chrome.runtime.sendMessage({ type: 'CP_OPEN_CHAT', phone: fone });
      return;
    }

    // Enviar mensagem: abre a conversa e envia o texto.
    if (e.data?.type === 'CP_ENVIAR_MSG') {
      const fone = normFone(e.data.phone);
      if (fone && e.data.texto) {
        chrome.runtime.sendMessage({ type: 'CP_SEND_MSG', phone: fone, texto: e.data.texto });
      }
      return;
    }

    if (e.data?.type !== 'CP_PEDIDO_CRIADO') return;
    const fone = normFone(e.data.phone);
    const code = e.data.code;
    if (!fone || !code) return;

    chrome.storage.local.get({ pedidos: {} }, (s) => {
      const pedidos = s.pedidos;
      const lista = pedidos[fone] || [];
      if (!lista.includes(code)) {
        lista.push(code);
        pedidos[fone] = lista;
        chrome.storage.local.set({ pedidos });
      }
    });
  });
})();
