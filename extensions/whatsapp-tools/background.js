// Service worker: geocodifica endereços via Nominatim (OpenStreetMap).
// Roda fora da página, então não esbarra no CSP do WhatsApp Web.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Abre a conversa: foca a aba do WhatsApp já aberta e manda abrir o chat;
  // se não houver aba, abre uma nova direto na conversa.
  if (msg?.type === 'CP_OPEN_CHAT') {
    let phone = String(msg.phone || '').replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      if (tabs && tabs.length) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
        chrome.tabs.sendMessage(tab.id, { type: 'CP_OPEN_CHAT_TAB', phone });
      } else {
        chrome.tabs.create({ url: `https://web.whatsapp.com/send?phone=${phone}` });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  // Enviar mensagem: foca a aba do WhatsApp e manda enviar o texto; sem aba,
  // abre uma nova já com o texto na caixa (send?phone&text).
  if (msg?.type === 'CP_SEND_MSG') {
    let phone = String(msg.phone || '').replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const texto = msg.texto || '';
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      if (tabs && tabs.length) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
        chrome.tabs.sendMessage(tab.id, { type: 'CP_SEND_MSG_TAB', phone, texto });
      } else {
        chrome.tabs.create({
          url: `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto)}`,
        });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  // Busca por CEP na base postal (AwesomeAPI) — retorna lat/lng direto.
  if (msg?.type === 'CP_CEP') {
    const cep = String(msg.cep || '').replace(/\D/g, '');
    fetch(`https://cep.awesomeapi.com.br/json/${cep}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.lat && d.lng) {
          const partes = [d.address, d.district, `${d.city} - ${d.state}`, cep].filter(Boolean);
          sendResponse({ results: [{ lat: d.lat, lon: d.lng, display: partes.join(', ') }] });
        } else {
          sendResponse({ results: [] });
        }
      })
      .catch((e) => sendResponse({ results: [], erro: String(e) }));
    return true;
  }

  if (msg?.type !== 'CP_GEOCODE') return;

  const q = encodeURIComponent(msg.query);
  const limit = Math.min(Math.max(Number(msg.limit) || 1, 1), 8);
  // viewbox da Grande São Paulo (São Paulo + capital) prioriza resultados
  // próximos; bounded=0 só influencia o ranking, não exclui os de fora.
  const url =
    `https://nominatim.openstreetmap.org/search?q=${q}` +
    `&format=json&limit=${limit}&countrycodes=br&addressdetails=0` +
    `&viewbox=-46.95,-23.30,-46.30,-23.80&bounded=0`;

  fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => r.json())
    .then((data) => {
      const results = Array.isArray(data)
        ? data.map((d) => ({ lat: d.lat, lon: d.lon, display: d.display_name }))
        : [];
      sendResponse({ results });
    })
    .catch((e) => sendResponse({ results: [], erro: String(e) }));

  return true; // resposta assíncrona
});
