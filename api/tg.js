/* Telegram webhook: o'quvchi bot orqali bog'lanadi, test yechadi, natija, profil va murojaat. */
const { kv, rid, K, readBody, send, loadData, tg } = require('./_lib');
const Core = require('../js/core.js');

const MENU = { keyboard: [[{ text: '📝 Test yechish' }, { text: '📊 Natijalarim' }], [{ text: '👤 Profil' }, { text: '✉️ Murojaat' }]], resize_keyboard: true };
const ASK_CONTACT = { keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const normPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 9 ? '998' + d : d; };
const r1 = x => Math.round(x * 10) / 10;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 200, { ok: true });
  const cid = String((req.query && req.query.c) || new URL(req.url, 'http://x').searchParams.get('c') || '');
  const cfgS = cid && await kv('GET', K.bot(cid));
  if (!cfgS) return send(res, 200, { ok: true });
  const cfg = JSON.parse(cfgS);
  if ((req.headers['x-telegram-bot-api-secret-token'] || '') !== cfg.secret) return send(res, 401, { ok: false });
  const upd = await readBody(req);
  try { await handle(cid, cfg, upd); } catch (e) { console.error(e); }
  return send(res, 200, { ok: true });
};

async function handle(cid, cfg, upd) {
  const say = (chat, text, extra) => tg(cfg.token, 'sendMessage', Object.assign({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {}));
  const msg = upd.message, cb = upd.callback_query;
  const chat = String(msg ? msg.chat.id : cb ? cb.message.chat.id : '');
  if (!chat) return;
  if (msg && msg.chat.type !== 'private') return;
  const stKey = K.state(cid, chat);
  const getState = async () => { const s = await kv('GET', stKey); return s ? JSON.parse(s) : {}; };
  const setState = async s => { await kv('SET', stKey, JSON.stringify(s)); await kv('EXPIRE', stKey, 86400); };
  const linkS = await kv('HGET', K.links(cid), chat);
  const link = linkS ? JSON.parse(linkS) : null;
  const data = await loadData(cid) || { students: [], tests: [], results: [], groups: [] };
  const center = (data.center && data.center.name) || cfg.name || "O'quv markaz";
  const student = link ? (data.students || []).find(s => String(s.tg) === chat) || (data.students || []).find(s => s.phone && s.phone === link.phone) || null : null;
  const who = student ? student.name : link ? link.name : '';

  if (cb) {
    await tg(cfg.token, 'answerCallbackQuery', { callback_query_id: cb.id });
    if (!link) return say(chat, 'Avval telefon raqamingizni yuboring.', { reply_markup: ASK_CONTACT });
    const [kind, a1, a2] = String(cb.data || '').split(':');
    if (kind === 'v') {
      const t = (data.tests || []).find(x => x.id === a1 && x.bot === 'open');
      if (!t) return say(chat, 'Test yopilgan.');
      await setState({ s: 'answers', testId: t.id, variant: a2 });
      return say(chat, answersHelp(t, a2));
    }
    if (kind === 'a') {
      await setState({ s: 'appeal', testId: a1 === '-' ? null : a1 });
      return say(chat, '✍️ Murojaatingizni yozing (savol raqami va izoh bilan, masalan: "12-savol: javob B bo‘lishi kerak, chunki…").');
    }
    return;
  }

  const text = (msg.text || '').trim();

  // Telefon raqami
  if (msg.contact) {
    if (String(msg.contact.user_id) !== String(msg.from.id)) return say(chat, 'Iltimos, o‘zingizning raqamingizni tugma orqali yuboring.', { reply_markup: ASK_CONTACT });
    const phone = normPhone(msg.contact.phone_number);
    const st = (data.students || []).find(s => s.phone === phone);
    const name = st ? st.name : [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(' ');
    await kv('HSET', K.links(cid), chat, JSON.stringify({ phone, name, username: msg.from.username || '', at: Date.now() }));
    await kv('RPUSH', K.inbox(cid), JSON.stringify({ type: 'link', id: 'l' + chat, chatId: chat, phone, name, username: msg.from.username || '', studentId: st ? st.id : null, at: Date.now() }));
    if (st) { await setState({}); return say(chat, `✅ Salom, <b>${esc(st.name)}</b>! Siz ${esc(center)} botiga ulandingiz.\n\nTestni yechish uchun "📝 Test yechish" tugmasini bosing.`, { reply_markup: MENU }); }
    await setState({ s: 'name' });
    return say(chat, "Raqamingiz markaz ro'yxatida topilmadi. Ism va familiyangizni to'liq yozing (masalan: Aliyev Vali):", { reply_markup: { remove_keyboard: true } });
  }

  if (!link) {
    return say(chat, `Assalomu alaykum! Bu <b>${esc(center)}</b> test boti.\n\nBoshlash uchun pastdagi tugma orqali telefon raqamingizni yuboring.`, { reply_markup: ASK_CONTACT });
  }

  const state = await getState();

  if (state.s === 'name' && text && !text.startsWith('/')) {
    const name = text.replace(/\s+/g, ' ').slice(0, 80);
    await kv('HSET', K.links(cid), chat, JSON.stringify(Object.assign({}, link, { name })));
    await kv('RPUSH', K.inbox(cid), JSON.stringify({ type: 'link', id: 'l' + chat + 'n', chatId: chat, phone: link.phone, name, username: link.username, studentId: null, at: Date.now() }));
    await setState({});
    return say(chat, `✅ Rahmat, ${esc(name)}! Endi test yechishingiz mumkin.`, { reply_markup: MENU });
  }

  if (text === '/start') { await setState({}); return say(chat, `Salom, <b>${esc(who)}</b>! ${esc(center)} test boti.`, { reply_markup: MENU }); }

  if (text === '📝 Test yechish' || text === '/test') {
    await setState({ s: 'code' });
    return say(chat, '🔑 O‘qituvchi bergan <b>test kodini</b> yuboring (6 belgi):');
  }

  if (text === '📊 Natijalarim' || text === '/natijalar') {
    await setState({});
    const P = progress(data, student, chat);
    const pend = await pending(cid, chat, data);
    const lines = P.items.slice(-10).reverse().map(x => `• <b>${esc(x.t.name)}</b> (${fmt(x.t.date)}): ${x.R ? `${x.R.T} ball · ${x.R.grade}` : `${x.ev.points}/${x.ev.max} (${x.ev.percent}%)`} · ${x.rank}-o'rin / ${x.of}`);
    pend.forEach(p => lines.unshift(`• <b>${esc(p.t.name)}</b>: ${p.text} <i>(tekshirilmoqda)</i>`));
    return say(chat, lines.length ? `📊 <b>Natijalaringiz</b>\n\n${lines.join('\n')}` : "Hozircha natijalar yo'q.", { reply_markup: MENU });
  }

  if (text === '👤 Profil' || text === '/profil') {
    await setState({});
    const P = progress(data, student, chat);
    const pend = await pending(cid, chat, data);
    if (!P.items.length) return say(chat, `👤 <b>${esc(who)}</b>\n${pend.length ? `📝 ${pend.length} ta natijangiz o'qituvchi ilovasiga yetib bormoqda — profil tez orada yangilanadi.` : "Hozircha natijalar yo'q."}`, { reply_markup: MENU });
    const bars = '▁▂▃▄▅▆▇█';
    const spark = P.items.slice(-12).map(x => bars[Math.min(7, Math.floor(x.pct / 12.5))]).join('');
    const g = student && student.groupId ? (data.groups || []).find(x => x.id === student.groupId) : null;
    return say(chat, `👤 <b>${esc(who)}</b>${g ? ' · ' + esc(g.name) : ''}\n\n🏅 Daraja: <b>${P.level}</b>\n🎯 Aniqlik: <b>${P.accuracy}%</b>\n🥇 Top-3 o'rinlar: <b>${P.top3}</b>\n📝 Testlar: <b>${P.items.length}</b>\n\n📈 O'sish (oxirgi ${Math.min(12, P.items.length)} ta):\n<code>${spark}</code>\n${P.items.slice(-12).map(x => Math.round(x.pct)).join(' · ')} %`, { reply_markup: MENU });
  }

  if (text === '✉️ Murojaat' || text === '/murojaat') {
    const P = progress(data, student, chat);
    const btns = P.items.slice(-5).reverse().map(x => [{ text: x.t.name.slice(0, 40), callback_data: `a:${x.t.id}` }]);
    btns.push([{ text: 'Umumiy savol', callback_data: 'a:-' }]);
    return say(chat, 'Qaysi test bo‘yicha murojaat qilasiz?', { reply_markup: { inline_keyboard: btns } });
  }

  if (state.s === 'appeal' && text) {
    await kv('RPUSH', K.inbox(cid), JSON.stringify({ type: 'appeal', id: rid(6), chatId: chat, phone: link.phone, name: who, studentId: student ? student.id : null, testId: state.testId, text: text.slice(0, 2000), at: Date.now() }));
    await setState({});
    return say(chat, '✅ Murojaatingiz o‘qituvchiga yuborildi. Javob shu botga keladi.', { reply_markup: MENU });
  }

  if (state.s === 'code' && text) {
    const code = text.toUpperCase().replace(/\s/g, '');
    const t = (data.tests || []).find(x => x.bot === 'open' && String(x.code || '').toUpperCase() === code);
    if (!t) return say(chat, '❌ Bunday kodli ochiq test topilmadi. Kodni tekshirib qayta yuboring.');
    if (await kv('SISMEMBER', K.done(cid, t.id), chat)) { await setState({}); return say(chat, '✅ Siz bu testni allaqachon topshirgansiz.', { reply_markup: MENU }); }
    if (!t.variants.every(v => Core.keyComplete(t, v.key))) return say(chat, 'Bu test kaliti hali to‘liq kiritilmagan. O‘qituvchiga murojaat qiling.');
    if (t.variants.length > 1) {
      await setState({ s: 'variant', testId: t.id });
      return say(chat, `📝 <b>${esc(t.name)}</b>\nVariantingizni tanlang:`, { reply_markup: { inline_keyboard: [t.variants.map(v => ({ text: 'Variant ' + v.code, callback_data: `v:${t.id}:${v.code}` }))] } });
    }
    await setState({ s: 'answers', testId: t.id, variant: t.variants[0].code });
    return say(chat, answersHelp(t, t.variants[0].code));
  }

  if (state.s === 'answers' && text) {
    const t = (data.tests || []).find(x => x.id === state.testId && x.bot === 'open');
    if (!t) { await setState({}); return say(chat, 'Test yopilgan.', { reply_markup: MENU }); }
    const p = Core.parseAnswers(t, text);
    if (p.error) return say(chat, '⚠️ ' + p.error + '\nQayta yuboring.');
    const openQ = Core.qInfo(t).map((x, i) => (x.kind === 'open' ? i : -1)).filter(i => i >= 0);
    if (openQ.length) {
      await setState({ s: 'open', testId: t.id, variant: state.variant, answers: p.answers });
      return say(chat, `✍️ Endi <b>${openQ.length} ta yozma savol</b> javoblarini yuboring — har birini yangi qatorda, tartib bilan (${openQ.map(q => q + 1).join(', ')}-savollar).`);
    }
    return finish(t, state.variant, p.answers, {});
  }

  if (state.s === 'open' && text) {
    const t = (data.tests || []).find(x => x.id === state.testId && x.bot === 'open');
    if (!t) { await setState({}); return say(chat, 'Test yopilgan.', { reply_markup: MENU }); }
    const openQ = Core.qInfo(t).map((x, i) => (x.kind === 'open' ? i : -1)).filter(i => i >= 0);
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length !== openQ.length) return say(chat, `⚠️ ${openQ.length} ta javob kerak, siz ${lines.length} ta yubordingiz. Har birini yangi qatorda yuboring.`);
    const openText = {};
    openQ.forEach((q, i) => { openText[q] = lines[i].replace(/^\d+\s*[.)-]\s*/, '').slice(0, 500); });
    return finish(t, state.variant, state.answers, openText);
  }

  return say(chat, 'Quyidagi tugmalardan birini tanlang.', { reply_markup: MENU });

  async function finish(t, variant, answers, openText) {
    const r = { id: '_', testId: t.id, variant, answers };
    const ev = Core.evaluate(t, r, student);
    await kv('RPUSH', K.inbox(cid), JSON.stringify({ type: 'result', id: rid(6), chatId: chat, phone: link.phone, name: who, studentId: student ? student.id : null, testId: t.id, variant, answers, openText, at: Date.now() }));
    await kv('SADD', K.done(cid, t.id), chat);
    await setState({});
    const info = Core.qInfo(t);
    const key = Core.normKey(t, Core.variantOf(t, variant).key);
    const wrong = ev.marks.map((m, i) => (m === 0 ? `${i + 1}: ${Core.show(info[i].sec, answers[i])} → <b>${Core.show(info[i].sec, key[i])}</b>` : m === -1 && info[i].kind !== 'open' ? `${i + 1}: — → <b>${Core.show(info[i].sec, key[i])}</b>` : '')).filter(Boolean);
    let out = `✅ <b>${esc(t.name)}</b> qabul qilindi.\n\n`;
    if (t.type === 'rasch') out += `To'g'ri javoblar: <b>${ev.correct}/${ev.total}</b>\nRasch ball va daraja test yakunlangach yuboriladi.`;
    else out += `Ball: <b>${ev.points} / ${ev.max}</b> (${ev.percent}%)\nTo'g'ri: ${ev.correct} · Noto'g'ri: ${ev.wrong} · Bo'sh: ${ev.blank - ev.pending}`;
    if (t.sections.length > 1) out += '\n\n' + ev.sections.map(s => `• ${esc(s.title)}: ${s.kind === 'open' ? 'o‘qituvchi baholaydi' : `${s.correct}/${s.count} — ${s.points} ball`}${s.cert ? ` (sertifikat ${esc(s.cert)})` : ''}`).join('\n');
    if (ev.pending) out += `\n\n✍️ ${ev.pending} ta yozma javob o'qituvchi tomonidan baholanadi.`;
    if (wrong.length && t.type !== 'rasch') out += `\n\n❌ Xato javoblar (sizniki → to'g'risi):\n${wrong.slice(0, 60).join('\n')}${wrong.length > 60 ? '\n…' : ''}`;
    return say(chat, out, { reply_markup: MENU });
  }
}

function answersHelp(t, variant) {
  let st = 0;
  const parts = t.sections.map(s => {
    const k = Core.kind(s);
    const a = st + 1, b = st + s.count; st += s.count;
    if (k === 'open') return `${a}–${b}: yozma (keyin alohida yuborasiz)`;
    if (k === 'tf') return `${a}–${b}: True/False — T yoki F`;
    return `${a}–${b}: ${Core.LETTERS.slice(0, Core.opts(s)).split('').join('/')}`;
  });
  const closed = Core.qInfo(t).filter(x => x.kind !== 'open').length;
  return `📝 <b>${esc(t.name)}</b>${t.variants.length > 1 ? ' · Variant ' + variant : ''}\n\n${parts.join('\n')}\n\nBarcha <b>${closed} ta</b> javobni bitta xabarda yuboring, masalan:\n<code>abcdabcd…</code> yoki <code>1a 2b 3c …</code>\nJavob bermagan savolga <code>-</code> qo'ying.`;
}

function progress(data, student, chat) {
  const items = [];
  let right = 0, total = 0, top3 = 0;
  if (!student) return { items, accuracy: 0, level: '—', top3: 0 };
  const byId = Object.fromEntries((data.students || []).map(s => [s.id, s]));
  for (const t of data.tests || []) {
    const rs = (data.results || []).filter(r => r.testId === t.id);
    const mine = rs.find(r => r.studentId === student.id);
    if (!mine) continue;
    const tb = Core.table(t, rs, r => byId[r.studentId] || null, null);
    const row = tb.rows.find(x => x.r.id === mine.id);
    right += row.ev.correct; total += row.ev.total;
    if (row.rank <= 3 && tb.rows.length >= 3) top3++;
    items.push({ t, ev: row.ev, R: row.T != null ? { T: row.T, grade: row.grade } : null, rank: row.rank, of: tb.rows.length, pct: row.T != null ? r1(row.T / 75 * 100) : row.ev.percent });
  }
  items.sort((a, b) => String(a.t.date || '').localeCompare(String(b.t.date || '')));
  const accuracy = total ? Math.round(right / total * 100) : 0;
  const level = !items.length ? '—' : accuracy >= 86 ? "A'lo" : accuracy >= 70 ? 'Yuqori' : accuracy >= 50 ? "O'rta" : "Boshlang'ich";
  return { items, accuracy, level, top3 };
}

async function pending(cid, chat, data) {
  const inbox = await kv('LRANGE', K.inbox(cid), 0, 199) || [];
  const out = [];
  for (const s of inbox) {
    let it; try { it = JSON.parse(s); } catch (e) { continue; }
    if (it.type !== 'result' || it.chatId !== chat) continue;
    const t = (data.tests || []).find(x => x.id === it.testId); if (!t) continue;
    const ev = Core.evaluate(t, { variant: it.variant, answers: it.answers }, null);
    out.push({ t, text: t.type === 'rasch' ? `${ev.correct} ta to'g'ri` : `${ev.points}/${ev.max}` });
  }
  return out;
}

function fmt(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return d; const p = n => String(n).padStart(2, '0'); return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`; }
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
