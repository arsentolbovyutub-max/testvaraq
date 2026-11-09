/* Admin API used by the app: connect a bot, publish/close tests, pull results. */
const L = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = await L.readBody(req);
  try {
    if (!L.redisCfg()) return res.status(503).json({ error: "Server bazasi (Redis) ulanmagan. Vercel → Storage bo'limida Upstash Redis qo'shing." });

    if (b.action === 'setup') {
      const token = String(b.token || '').trim();
      if (!/^\d+:[\w-]{30,}$/.test(token)) return res.status(400).json({ error: "Bot token formati noto'g'ri" });
      const me = await L.tg(token, 'getMe');
      if (!me.ok) return res.status(400).json({ error: "Token ishlamadi: " + (me.description || '') });
      let cid = b.cid, key = b.key, old = cid ? await L.getJ('c:' + cid) : null;
      if (!old || old.keyHash !== L.sha(key)) { cid = L.rand(9).replace(/[^\w]/g, 'x'); key = L.rand(24); }
      const whSecret = L.rand(24).replace(/[^\w]/g, 'x');
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const wh = await L.tg(token, 'setWebhook', { url: `https://${host}/api/tg?c=${cid}`, secret_token: whSecret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
      if (!wh.ok) return res.status(400).json({ error: 'Webhook xatosi: ' + (wh.description || '') });
      await L.tg(token, 'setMyCommands', { commands: [{ command: 'start', description: 'Boshlash' }, { command: 'testlar', description: 'Ochiq testlar' }, { command: 'natijalar', description: 'Natijalarim' }] });
      await L.setJ('c:' + cid, { token, keyHash: L.sha(key), name: String(b.name || '').slice(0, 80), username: me.result.username, whSecret });
      return res.json({ cid, key, username: me.result.username });
    }

    const c = b.cid ? await L.getJ('c:' + b.cid) : null;
    if (!c || c.keyHash !== L.sha(b.key)) return res.status(401).json({ error: 'Bot ulanmagan yoki kalit noto‘g‘ri' });

    if (b.action === 'status') {
      const open = await L.redis('SMEMBERS', 'tl:' + b.cid);
      if (b.name && b.name !== c.name) { c.name = String(b.name).slice(0, 80); await L.setJ('c:' + b.cid, c); }
      return res.json({ username: c.username, open: open || [] });
    }

    if (b.action === 'publish') {
      const t = b.test;
      if (!t || !t.id || !Array.isArray(t.sections) || !Array.isArray(t.variants)) return res.status(400).json({ error: 'Test noto‘g‘ri' });
      const n = L.qCount(t);
      if (n < 1 || n > 200) return res.status(400).json({ error: 'Savollar soni noto‘g‘ri' });
      if (t.variants.some(v => typeof v.key !== 'string' || v.key.length !== n || v.key.includes('-'))) return res.status(400).json({ error: "Javob kaliti to'liq emas" });
      const clean = { id: String(t.id), name: String(t.name || '').slice(0, 120), type: t.type, date: t.date, sections: t.sections.map(s => ({ title: String(s.title).slice(0, 60), count: +s.count, weight: +s.weight })), variants: t.variants.map(v => ({ code: String(v.code).slice(0, 2), key: v.key })), open: true };
      await L.setJ(`t:${b.cid}:${clean.id}`, clean);
      await L.redis('SADD', 'tl:' + b.cid, clean.id);
      return res.json({ ok: true });
    }

    if (b.action === 'close') {
      const t = await L.getJ(`t:${b.cid}:${b.testId}`);
      if (t) { t.open = false; await L.setJ(`t:${b.cid}:${b.testId}`, t); }
      await L.redis('SREM', 'tl:' + b.cid, String(b.testId));
      return res.json({ ok: true });
    }

    if (b.action === 'results') {
      const h = await L.redis('HGETALL', `r:${b.cid}:${b.testId}`) || [];
      const out = [];
      for (let i = 0; i < h.length; i += 2) { try { out.push(Object.assign({ tgId: h[i] }, JSON.parse(h[i + 1]))); } catch (e) {} }
      return res.json({ results: out });
    }

    if (b.action === 'disconnect') {
      await L.tg(c.token, 'deleteWebhook', {});
      await L.redis('DEL', 'c:' + b.cid);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Noma’lum amal' });
  } catch (e) {
    return res.status(500).json({ error: e.message === 'NO_DB' ? 'Server bazasi ulanmagan' : e.message });
  }
};
