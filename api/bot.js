/* Markaz botini boshqarish: ulash, holat, uzish, natija yuborish, ommaviy xabar. */
const { kv, rid, K, readBody, send, auth, tg } = require('./_lib');

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST kerak' });
  const b = await readBody(req);
  const a = await auth(b.token).catch(() => null);
  if (!a) return send(res, 401, { error: "Avval bulut sinxronlashni yoqing (Yana → Bulut sinxronlash)" });
  const cid = a.cid;
  try {
    const cfgS = await kv('GET', K.bot(cid));
    const cfg = cfgS ? JSON.parse(cfgS) : null;
    switch (b.action) {
      case 'setup': {
        const token = String(b.botToken || '').trim();
        if (!/^\d+:[\w-]{30,}$/.test(token)) return send(res, 400, { error: "Token formati noto'g'ri (123456789:AA… ko'rinishida)" });
        const me = await tg(token, 'getMe');
        if (!me.ok) return send(res, 400, { error: 'Telegram tokenni qabul qilmadi: ' + (me.description || '') });
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const secret = rid(16);
        const hook = await tg(token, 'setWebhook', { url: `https://${host}/api/tg?c=${cid}`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
        if (!hook.ok) return send(res, 400, { error: 'Webhook o‘rnatilmadi: ' + (hook.description || '') });
        await tg(token, 'setMyCommands', { commands: [
          { command: 'start', description: 'Boshlash' }, { command: 'test', description: 'Test yechish' },
          { command: 'natijalar', description: 'Natijalarim' }, { command: 'profil', description: 'Profil va o‘sish' },
          { command: 'murojaat', description: 'O‘qituvchiga murojaat' }] });
        await kv('SET', K.bot(cid), JSON.stringify({ token, username: me.result.username, secret, name: b.centerName || '' }));
        return send(res, 200, { username: me.result.username });
      }
      case 'status': {
        if (!cfg) return send(res, 200, { connected: false });
        const info = await tg(cfg.token, 'getWebhookInfo');
        const linked = await kv('HLEN', K.links(cid));
        return send(res, 200, { connected: true, username: cfg.username, linked, pending: info.result ? info.result.pending_update_count : null, lastError: info.result ? info.result.last_error_message || null : null });
      }
      case 'disconnect': {
        if (cfg) await tg(cfg.token, 'deleteWebhook', {});
        await kv('DEL', K.bot(cid));
        return send(res, 200, { ok: true });
      }
      case 'notify': {
        if (!cfg) return send(res, 400, { error: 'Bot ulanmagan' });
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 300);
        let sent = 0, failed = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it.chatId || !it.text) { failed++; continue; }
          const r = await tg(cfg.token, 'sendMessage', { chat_id: it.chatId, text: String(it.text).slice(0, 4000) });
          if (r.ok) sent++; else failed++;
          if (i % 25 === 24) await sleep(1000);
        }
        return send(res, 200, { sent, failed });
      }
      case 'broadcast': {
        if (!cfg) return send(res, 400, { error: 'Bot ulanmagan' });
        const text = String(b.text || '').slice(0, 1000);
        if (!text && !b.photo) return send(res, 400, { error: 'Matn kiriting' });
        let chats = await kv('HKEYS', K.links(cid)) || [];
        if (Array.isArray(b.chatIds) && b.chatIds.length) { const set = new Set(b.chatIds.map(String)); chats = chats.filter(c => set.has(String(c))); }
        let photo = null;
        if (b.photo) {
          const m = /^data:(image\/\w+);base64,(.+)$/.exec(b.photo);
          if (m) photo = { buf: Buffer.from(m[2], 'base64'), type: m[1] };
        }
        let sent = 0, failed = 0, fileId = null;
        for (let i = 0; i < chats.length; i++) {
          let r;
          if (photo && !fileId) {
            r = await tg(cfg.token, 'sendPhoto', { chat_id: chats[i], caption: text }, { field: 'photo', buf: photo.buf, type: photo.type, name: 'rasm.jpg' });
            if (r.ok && r.result && r.result.photo) fileId = r.result.photo[r.result.photo.length - 1].file_id;
          } else if (fileId) r = await tg(cfg.token, 'sendPhoto', { chat_id: chats[i], photo: fileId, caption: text });
          else r = await tg(cfg.token, 'sendMessage', { chat_id: chats[i], text });
          if (r && r.ok) sent++; else failed++;
          if (i % 25 === 24) await sleep(1000);
        }
        return send(res, 200, { total: chats.length, sent, failed });
      }
      default: return send(res, 400, { error: "Noma'lum amal" });
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server xatosi: ' + e.message });
  }
};
