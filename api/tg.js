/* Telegram webhook: students pick an open test, send their answers, get the result at once. */
const L = require('./_lib');

const MENU = { keyboard: [[{ text: '📝 Testlar' }, { text: '📊 Natijalarim' }], [{ text: "✏️ Ismni o'zgartirish" }]], resize_keyboard: true };
const TYPE = { block: 'Blok test', simple: 'Oddiy test', rasch: 'Rasch test' };

module.exports = async (req, res) => {
  try {
    const cid = String(req.query.c || '');
    const c = cid ? await L.getJ('c:' + cid) : null;
    if (!c || req.headers['x-telegram-bot-api-secret-token'] !== c.whSecret) return res.status(401).end();
    const up = await L.readBody(req);
    const bot = new Bot(cid, c);
    if (up.callback_query) await bot.onCallback(up.callback_query);
    else if (up.message && up.message.chat && up.message.chat.type === 'private') await bot.onMessage(up.message);
  } catch (e) { console.error(e); }
  res.status(200).json({ ok: true });
};

class Bot {
  constructor(cid, c) { this.cid = cid; this.c = c; }
  send(chat, text, extra) { return L.tg(this.c.token, 'sendMessage', Object.assign({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {})); }
  uKey(uid) { return `u:${this.cid}:${uid}`; }
  async user(uid) { return (await L.getJ(this.uKey(uid))) || { name: '', state: null }; }
  saveUser(uid, u) { return L.setJ(this.uKey(uid), u); }
  test(tid) { return L.getJ(`t:${this.cid}:${tid}`); }

  async onMessage(m) {
    const uid = m.from.id, chat = m.chat.id;
    const text = String(m.text || '').trim();
    const u = await this.user(uid);

    if (text.startsWith('/start') || (!u.name && u.state !== 'name')) {
      if (!u.name) {
        u.state = 'name'; await this.saveUser(uid, u);
        return this.send(chat, `Assalomu alaykum! <b>${L.esc(this.c.name || 'O‘quv markaz')}</b> test botiga xush kelibsiz.\n\nIsm va familiyangizni yozing (masalan: <i>Aliyev Vali</i>):`, { reply_markup: { remove_keyboard: true } });
      }
      u.state = null; await this.saveUser(uid, u);
      await this.send(chat, `Salom, <b>${L.esc(u.name)}</b>!`, { reply_markup: MENU });
      return this.listTests(chat);
    }
    if (u.state === 'name' && text && !text.startsWith('/')) {
      const name = text.replace(/\s+/g, ' ').slice(0, 60);
      if (name.length < 3) return this.send(chat, "Iltimos, to'liq ism familiyangizni yozing:");
      u.name = name; u.state = null; await this.saveUser(uid, u);
      await this.send(chat, `Rahmat, <b>${L.esc(name)}</b>!`, { reply_markup: MENU });
      return this.listTests(chat);
    }
    if (text === "✏️ Ismni o'zgartirish" || text === '/ism') {
      u.state = 'name'; await this.saveUser(uid, u);
      return this.send(chat, 'Yangi ism familiyangizni yozing:');
    }
    if (text === '📝 Testlar' || text === '/testlar') { u.state = null; await this.saveUser(uid, u); return this.listTests(chat); }
    if (text === '📊 Natijalarim' || text === '/natijalar') return this.myResults(chat, uid);

    if (u.state === 'answer' && u.testId) return this.onAnswers(chat, uid, u, text, m.from.username);

    return this.send(chat, 'Test yechish uchun «📝 Testlar» tugmasini bosing.', { reply_markup: MENU });
  }

  async listTests(chat) {
    const ids = (await L.redis('SMEMBERS', 'tl:' + this.cid)) || [];
    const tests = (await Promise.all(ids.map(id => this.test(id)))).filter(t => t && t.open);
    if (!tests.length) return this.send(chat, 'Hozircha ochiq test yo‘q. O‘qituvchingiz test ochganda shu yerda paydo bo‘ladi.', { reply_markup: MENU });
    tests.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return this.send(chat, '<b>Ochiq testlar</b> — birini tanlang:', {
      reply_markup: { inline_keyboard: tests.slice(0, 30).map(t => [{ text: `${t.name} · ${TYPE[t.type] || ''} · ${L.qCount(t)} savol`.slice(0, 60), callback_data: 't:' + t.id }]) }
    });
  }

  async onCallback(q) {
    const uid = q.from.id, chat = q.message.chat.id;
    await L.tg(this.c.token, 'answerCallbackQuery', { callback_query_id: q.id });
    const u = await this.user(uid);
    if (!u.name) { u.state = 'name'; await this.saveUser(uid, u); return this.send(chat, 'Avval ism familiyangizni yozing:'); }
    const [kind, tid, code] = String(q.data || '').split(':');
    const t = await this.test(tid);
    if (!t || !t.open) return this.send(chat, 'Bu test yopilgan.');
    const prev = await L.redis('HGET', `r:${this.cid}:${tid}`, String(uid));
    if (prev) return this.send(chat, 'Siz bu testni topshirgansiz:\n\n' + await this.resultText(t, uid, JSON.parse(prev)));
    if (kind === 't' && t.variants.length > 1) {
      return this.send(chat, `<b>${L.esc(t.name)}</b>\nVariantingizni tanlang:`, { reply_markup: { inline_keyboard: [t.variants.map(v => ({ text: 'Variant ' + v.code, callback_data: `v:${t.id}:${v.code}` }))] } });
    }
    const variant = kind === 'v' && t.variants.some(v => v.code === code) ? code : t.variants[0].code;
    u.state = 'answer'; u.testId = t.id; u.variant = variant; await this.saveUser(uid, u);
    const n = L.qCount(t);
    let secs = '';
    if (t.sections.length > 1) { let s = 1; secs = '\n' + t.sections.map(x => { const l = `• ${s}–${s + x.count - 1}: ${L.esc(x.title)}`; s += x.count; return l; }).join('\n') + '\n'; }
    return this.send(chat, `<b>${L.esc(t.name)}</b>${t.variants.length > 1 ? ' · Variant ' + variant : ''}\n${n} ta savol.${secs}\nJavoblaringizni <b>bitta xabarda</b> yuboring:\n<code>abcdabcd…</code> (${n} ta harf)\nyoki raqam bilan: <code>1a 2b 3c …</code>`);
  }

  async onAnswers(chat, uid, u, text, username) {
    const t = await this.test(u.testId);
    if (!t || !t.open) { u.state = null; await this.saveUser(uid, u); return this.send(chat, 'Bu test yopilgan.', { reply_markup: MENU }); }
    const n = L.qCount(t);
    const p = L.parseAnswers(text, n);
    if (!p) return this.send(chat, `Javoblar topilmadi. Masalan: <code>abcd…</code> (${n} ta harf) yoki <code>1a 2b 3c</code>`);
    if (!/\d/.test(text) && p.count !== n) return this.send(chat, `Siz <b>${p.count}</b> ta javob yubordingiz, <b>${n}</b> ta kerak. Qaytadan yuboring.`);
    const key = `r:${this.cid}:${t.id}`;
    const row = { name: u.name, username: username || '', variant: u.variant || t.variants[0].code, answers: p.answers, at: new Date().toISOString() };
    const added = await L.redis('HSETNX', key, String(uid), JSON.stringify(row));
    u.state = null; u.testId = null; await this.saveUser(uid, u);
    if (!added) return this.send(chat, 'Siz bu testni allaqachon topshirgansiz.', { reply_markup: MENU });
    await L.redis('SADD', `ur:${this.cid}:${uid}`, t.id);
    return this.send(chat, '✅ Javoblaringiz qabul qilindi!\n\n' + await this.resultText(t, uid, row), { reply_markup: MENU });
  }

  async resultText(t, uid, row) {
    const ev = L.evaluate(t, row.variant, row.answers);
    let s = `<b>${L.esc(t.name)}</b>\n👤 ${L.esc(row.name)}${t.variants.length > 1 ? ' · Variant ' + row.variant : ''}\n`;
    if (t.sections.length > 1) s += '\n' + ev.sections.map(x => `• ${L.esc(x.title)}: ${x.correct}/${x.count} — <b>${x.points}</b> ball`).join('\n') + '\n';
    s += `\nTo'g'ri javoblar: <b>${ev.correct}/${ev.total}</b>`;
    if (t.type === 'rasch') {
      const h = (await L.redis('HGETALL', `r:${this.cid}:${t.id}`)) || [];
      const rows = [], ids = [];
      for (let i = 0; i < h.length; i += 2) { ids.push(h[i]); rows.push(JSON.parse(h[i + 1])); }
      const R = L.rasch(t, rows)[ids.indexOf(String(uid))];
      if (R) s += `\nRasch ball: <b>${R.T}</b> · Daraja: <b>${R.grade}</b>\n<i>Taxminiy: ball barcha ishtirokchilar natijasiga bog'liq va o'zgarishi mumkin.</i>`;
    } else {
      s += `\nUmumiy ball: <b>${ev.points} / ${ev.max}</b> (${ev.percent}%)`;
      if (t.type === 'block') s += '\n<i>Milliy sertifikat bo‘lsa, markaz natijasida qo‘shib hisoblanadi.</i>';
    }
    // wrong answers list
    const v = t.variants.find(x => x.code === row.variant) || t.variants[0];
    const wrong = [];
    for (let i = 0; i < v.key.length; i++) if (row.answers[i] !== v.key[i]) wrong.push(i + 1);
    if (wrong.length && wrong.length <= 60) s += `\n\n❌ Xato/bo'sh: ${wrong.join(', ')}`;
    return s;
  }

  async myResults(chat, uid) {
    const ids = (await L.redis('SMEMBERS', `ur:${this.cid}:${uid}`)) || [];
    if (!ids.length) return this.send(chat, "Hali natijangiz yo'q.", { reply_markup: MENU });
    const lines = [];
    for (const id of ids.slice(-15)) {
      const t = await this.test(id); if (!t) continue;
      const raw = await L.redis('HGET', `r:${this.cid}:${id}`, String(uid)); if (!raw) continue;
      const row = JSON.parse(raw); const ev = L.evaluate(t, row.variant, row.answers);
      lines.push(`• <b>${L.esc(t.name)}</b> — ${ev.correct}/${ev.total}${t.type === 'rasch' ? '' : `, ${ev.points} ball`}`);
    }
    return this.send(chat, '<b>Natijalarim</b>\n\n' + (lines.join('\n') || "Natija yo'q"), { reply_markup: MENU });
  }
}
