// Roda no mundo MAIN — tem acesso a window.require do WhatsApp Web.
// Responde a pedidos do content script isolado (nome+telefone do chat ativo,
// e lista de chats para casar as conversas da lista lateral).
(function () {
  'use strict';

  function modelsArray() {
    const CC = window.require('WAWebChatCollection').ChatCollection;
    if (typeof CC.getModelsArray === 'function') return CC.getModelsArray();
    if (CC._models) return Object.values(CC._models);
    return [];
  }

  function nomeDoChat(c) {
    const ct = c?.contact || {};
    return (
      ct.pushname ||
      ct.name ||
      ct.verifiedName ||
      ct.notifyName ||
      ct.formattedName ||
      ct.displayName ||
      c?.formattedTitle ||
      ''
    );
  }

  // Acha o chat do número: lista carregada ou via FindChatAction. Trata o 9 BR.
  async function acharChat(phoneRaw) {
    let p = String(phoneRaw).replace(/\D/g, '');
    if (!p.startsWith('55')) p = '55' + p;

    const ids = [p + '@c.us'];
    if (p.length === 13 && p[4] === '9') ids.push(p.slice(0, 4) + p.slice(5) + '@c.us');

    const CC = window.require('WAWebChatCollection').ChatCollection;
    const models = typeof CC.getModelsArray === 'function' ? CC.getModelsArray() : [];
    let chat = models.find((c) => ids.includes(c?.id?._serialized)) || null;

    if (!chat) {
      const finder = window.require('WAWebFindChatAction');
      const WidFactory = window.require('WAWebWidFactory');
      const wid = WidFactory.createWid(p + '@c.us');
      chat =
        (finder.findExistingChat && (await finder.findExistingChat(wid))) ||
        (finder.findOrCreateLatestChat && (await finder.findOrCreateLatestChat(wid))) ||
        null;
    }
    return chat;
  }

  // Abre a conversa no painel do WhatsApp (formatos variam por versão).
  async function abrirChatModel(chat) {
    const { Cmd } = window.require('WAWebCmd');
    const tentativas = [
      () => Cmd.openChatAt({ chatId: chat.id }),
      () => Cmd.openChatAt({ chat }),
      () => Cmd.openChatBottom({ chat }),
      () => Cmd.openChatBottom(chat),
      () => Cmd.openChatFromUnread(chat),
    ];
    for (const fn of tentativas) {
      try {
        await fn();
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function abrirChatInterno(phoneRaw) {
    try {
      const chat = await acharChat(phoneRaw);
      if (!chat) return false;
      return await abrirChatModel(chat);
    } catch (_) {
      return false;
    }
  }

  // Abre a conversa e envia o texto (auto-send). Formatos de envio variam.
  async function enviarMensagemInterno(phoneRaw, texto) {
    try {
      const chat = await acharChat(phoneRaw);
      if (!chat) return false;
      await abrirChatModel(chat);

      const tentativas = [
        () => window.require('WAWebSendTextMsgAction').sendTextMsgToChat(chat, texto),
        () => window.require('WAWebSendTextMsgAction').default(chat, texto),
        () => chat.sendMessage(texto),
      ];
      for (const fn of tentativas) {
        try {
          await fn();
          return true;
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const reqId = e.data?.reqId;

    if (e.data?.type === 'CP_OPEN_CHAT_MAIN') {
      abrirChatInterno(e.data.phone).then((ok) => {
        window.postMessage({ type: 'CP_OPEN_CHAT_RESULT', ok: !!ok }, '*');
      });
      return;
    }

    if (e.data?.type === 'CP_SEND_MSG_MAIN') {
      enviarMensagemInterno(e.data.phone, e.data.texto).then((ok) => {
        window.postMessage({ type: 'CP_SEND_MSG_RESULT', ok: !!ok }, '*');
      });
      return;
    }

    // Nome + telefone do chat ativo
    if (e.data?.type === 'CP_GET_PHONE') {
      try {
        const active = modelsArray().find((c) => c && c.active);
        const jid = active?.id?._serialized || '';
        const phone = jid.split('@')[0];
        window.postMessage(
          {
            type: 'CP_PHONE_RESULT',
            reqId,
            phone: /^\d{10,15}$/.test(phone) ? phone : '',
            nome: nomeDoChat(active) || '',
          },
          '*',
        );
      } catch (_) {
        window.postMessage({ type: 'CP_PHONE_RESULT', reqId, phone: '', nome: '' }, '*');
      }
      return;
    }

    // Lista de chats (título + telefone) para casar com a lista lateral
    if (e.data?.type === 'CP_GET_CHATS') {
      try {
        const chats = modelsArray().map((c) => {
          const jid = c?.id?._serialized || '';
          const phone = jid.split('@')[0];
          return {
            title: nomeDoChat(c) || '',
            phone: /^\d{10,15}$/.test(phone) ? phone : '',
          };
        });
        window.postMessage({ type: 'CP_CHATS_RESULT', reqId, chats }, '*');
      } catch (_) {
        window.postMessage({ type: 'CP_CHATS_RESULT', reqId, chats: [] }, '*');
      }
      return;
    }
  });
})();
