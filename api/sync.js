/* Bulut sinxronlash: markazni ro'yxatdan o'tkazish, boshqa qurilmadan kirish, ma'lumotlarni yuklash/yuborish, bot "pochtasi". */
const { kv, enabled, unpack, rid, K, readBody, send, auth } = require('./_lib');

const phonesOf = d => (d && Array.isArray(d.users) ? d.users.map(u => u.phone).filter(Boolean) : []);

module.exports = async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { enabled: enabled() || !!process.env.TV_MEMORY_KV });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST kerak' });
  if (!enabled() && !process.env.TV_MEMORY_KV) return send(res, 503, { error: "Bulut sozlanmagan: Vercel'da Upstash Redis ulang (qo'llanmaga qarang)." });
  const b = await readBody(req);
  try {
    switch (b.action) {
      case 'status': return send(res, 200, { enabled: true });

      case 'register': {
        if (typeof b.data !== 'string' || b.data.length > 3e6) return send(res, 400, { error: "Ma'lumot noto'g'ri" });
        const d = unpack(b.data);
        const phones = phonesOf(d);
        if (!d || !d.center || !phones.length) return send(res, 400, { error: "Markaz ma'lumoti yo'q" });
        for (const ph of phones) if (await kv('GET', K.phone(ph))) return send(res, 409, { error: `+${ph} raqami bilan markaz bulutda allaqachon bor. "Kirish" orqali kiring.` });
        const cid = rid(8);
        await kv('SET', K.data(cid), b.data);
        await kv('SET', K.rev(cid), '1');
        for (const ph of phones) await kv('SET', K.phone(ph), cid);
        const token = rid(24);
        await kv('SET', K.tok(token), JSON.stringify({ cid, userId: b.userId || null }));
        return send(res, 200, { cid, token, rev: 1 });
      }

      case 'login': {
        const ph = String(b.phone || '').replace(/\D/g, '');
        const cid = ph && await kv('GET', K.phone(ph));
        if (!cid) return send(res, 404, { error: "Bu telefon bilan bulutda hisob topilmadi" });
        const s = await kv('GET', K.data(cid));
        const d = unpack(s);
        const u = d && (d.users || []).find(x => x.phone === ph && x.pass === b.pass);
        if (!u) return send(res, 401, { error: "Telefon yoki parol noto'g'ri" });
        const token = rid(24);
        await kv('SET', K.tok(token), JSON.stringify({ cid, userId: u.id }));
        const rev = +(await kv('GET', K.rev(cid))) || 1;
        return send(res, 200, { cid, token, rev, data: s, userId: u.id });
      }

      case 'pull': {
        const a = await auth(b.token); if (!a) return send(res, 401, { error: 'Sessiya tugagan, qayta kiring' });
        const rev = +(await kv('GET', K.rev(a.cid))) || 0;
        const out = { rev };
        if (rev !== +b.rev) out.data = await kv('GET', K.data(a.cid));
        const inbox = await kv('LRANGE', K.inbox(a.cid), 0, 199) || [];
        out.inbox = inbox.map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
        out.inboxN = inbox.length;
        const bot = await kv('GET', K.bot(a.cid));
        out.bot = bot ? { username: JSON.parse(bot).username } : null;
        return send(res, 200, out);
      }

      case 'push': {
        const a = await auth(b.token); if (!a) return send(res, 401, { error: 'Sessiya tugagan, qayta kiring' });
        if (typeof b.data !== 'string' || b.data.length > 3e6) return send(res, 413, { error: "Ma'lumot juda katta" });
        const rev = +(await kv('GET', K.rev(a.cid))) || 0;
        if (rev !== +b.baseRev) return send(res, 409, { rev, data: await kv('GET', K.data(a.cid)) });
        const d = unpack(b.data);
        await kv('SET', K.data(a.cid), b.data);
        const nrev = await kv('INCR', K.rev(a.cid));
        for (const ph of phonesOf(d)) await kv('SET', K.phone(ph), a.cid);
        return send(res, 200, { rev: +nrev });
      }

      case 'ack': {
        const a = await auth(b.token); if (!a) return send(res, 401, { error: 'Sessiya tugagan' });
        const n = Math.max(0, parseInt(b.n) || 0);
        if (n) await kv('LTRIM', K.inbox(a.cid), n, -1);
        return send(res, 200, { ok: true });
      }

      default: return send(res, 400, { error: "Noma'lum amal" });
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server xatosi: ' + e.message });
  }
};
