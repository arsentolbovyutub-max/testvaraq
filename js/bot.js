/* Telegram bot (mijoz qismi). Server: api/bot.js (boshqaruv) va api/tg.js (webhook). Bot bulut orqali ishlaydi. */
const TBot = {
  cfg() { return DB.data.settings.bot || null; },
  async call(action, extra) {
    const c = DB.data.cloud;
    if (!c) throw new Error("Avval bulut sinxronlashni yoqing (Yana → Bulut)");
    let r;
    try {
      r = await fetch('api/bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action, token: c.token }, extra || {})) });
    } catch (e) { throw new Error("Internetga ulanib bo'lmadi"); }
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error('Server javob bermadi (' + r.status + ')'); }
    if (!r.ok || j.error) throw new Error(j.error || 'Xatolik ' + r.status);
    return j;
  },
  /* Natijalarni o'quvchilarning Telegramiga yuborish. */
  async notifyResults(t, results, silent) {
    if (!this.cfg() || !DB.data.cloud) { if (!silent) toast('Bot ulanmagan', 'err'); return; }
    const items = results.map(r => { const st = r.studentId ? DB.student(r.studentId) : null; return st && st.tg ? { chatId: st.tg, text: resultText(t, r) } : null; }).filter(Boolean);
    if (!items.length) { if (!silent) toast("Telegramga ulangan o'quvchi yo'q", 'err'); return; }
    try {
      const r = await this.call('notify', { items });
      if (!silent) toast(`Telegramga yuborildi: ${r.sent}${r.failed ? ', xato: ' + r.failed : ''}`);
    } catch (e) { if (!silent) toast(e.message, 'err'); }
  },
  code() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return DB.data.tests.some(t => t.code === s) ? this.code() : s;
  }
};

V.bot = async function () {
  if (!DB.isAdmin()) { location.hash = '#/more'; return; }
  if (!DB.data.cloud) {
    layout('Telegram bot', `<div class="card"><h3>Avval bulutni yoqing</h3><p class="small">Bot o'quvchilarga test berishi va natijalarni ilovaga qaytarishi uchun ma'lumotlar bulutda bo'lishi kerak.</p><a class="btn pri" href="#/cloud">☁ Bulut sinxronlash</a></div>`, { back: '#/more', tab: 'more' });
    return;
  }
  const c = TBot.cfg();
  const hist = (DB.data.broadcasts || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);
  const linked = DB.data.students.filter(s => s.tg).length;
  const groups = DB.myGroups();
  const body = c ? `<div class="card"><h3>Bot ulangan ✓</h3>
        <p><a href="https://t.me/${esc(c.username)}" target="_blank" rel="noopener">@${esc(c.username)}</a> — bu havolani o'quvchilarga yuboring. O'quvchi telefon raqamini yuboradi va ro'yxatdagi o'zi bilan avtomatik bog'lanadi.</p>
        <p class="small muted" id="bst">Holat tekshirilmoqda…</p>
        <div class="btns"><button class="btn" id="copy">Havolani nusxalash</button><button class="btn danger" id="off">Botni uzish</button></div></div>
      <div class="card"><h3>📣 Xabar yuborish</h3>
        <p class="small muted" style="margin-top:0">Botga ulangan o'quvchilarga e'lon (${linked} ta).</p>
        <label class="f"><span>Kimga</span><select class="in" id="bto"><option value="">Barcha ulangan o'quvchilar</option>${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        <label class="f"><span>Matn</span><textarea class="in" id="btext" rows="4" placeholder="Ertaga soat 10:00 da blok test bo'ladi…" style="font-family:inherit"></textarea></label>
        <label class="f"><span>Rasm (ixtiyoriy)</span><input type="file" class="in" id="bimg" accept="image/*"></label>
        <button class="btn pri block" id="bsend">Yuborish</button></div>
      ${hist.length ? `<div class="card"><h3>Yuborilgan xabarlar</h3>${hist.map(h => `<div style="border-bottom:1px solid var(--line);padding:8px 0"><div class="small muted">${new Date(h.at).toLocaleString()} · ${esc(h.to || 'Hammaga')} · ✓ ${h.sent}${h.failed ? ' · ✗ ' + h.failed : ''}${h.photo ? ' · 🖼' : ''}</div><div class="small">${esc(h.text)}</div></div>`).join('')}</div>` : ''}
      <div class="card"><h3>Qanday ishlaydi</h3><ol class="small" style="padding-left:18px;margin:0">
        <li>Test → Natijalar → <b>Botda ochish</b> — 6 belgili kod chiqadi.</li>
        <li>O'quvchi botda "📝 Test yechish" → kod → javoblarni bitta xabarda yuboradi (<code>abcd…</code> yoki <code>1a 2b…</code>, True/False uchun T/F).</li>
        <li>Natija darhol botda chiqadi; ilovaga avtomatik tushadi.</li>
        <li>Botda o'quvchi "👤 Profil" (daraja, aniqlik, top-3, o'sish) va "✉️ Murojaat" bo'limlaridan foydalanadi.</li></ol></div>
      <div class="card"><h3>Tokenni almashtirish</h3><div class="row"><input class="in" id="tok" placeholder="Yangi bot token"><button class="btn" id="re">Ulash</button></div></div>`
    : `<div class="card"><h3>1. Bot yarating</h3><ol class="small" style="padding-left:18px;margin:0">
        <li>Telegramda <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> ni oching va <code>/newbot</code> yuboring.</li>
        <li>Bot nomini (masalan: <i>${esc(DB.data.center.name)} testlar</i>) va <code>…_bot</code> bilan tugaydigan username kiriting.</li>
        <li>BotFather bergan <b>token</b>ni nusxalang (<code>123456789:AA…</code>).</li></ol></div>
      <div class="card"><h3>2. Tokenni kiriting</h3>
        <label class="f"><span>Bot token</span><input class="in" id="tok" placeholder="123456789:AA..." autocomplete="off"></label>
        <button class="btn pri block" id="re">Botni ulash</button>
        <p class="small muted">Token faqat serverda saqlanadi.</p></div>`;
  layout('Telegram bot', body, { back: '#/more', tab: 'more' });

  $('#re').onclick = async e => {
    const token = $('#tok').value.trim();
    if (!token) { toast('Token kiriting', 'err'); return; }
    e.target.disabled = true;
    try {
      const r = await TBot.call('setup', { botToken: token, centerName: DB.data.center.name });
      DB.data.settings.bot = { username: r.username };
      DB.save(); toast('Bot ulandi: @' + r.username); V.bot();
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
  };
  if (!c) return;
  TBot.call('status').then(s => {
    const el = $('#bst'); if (!el) return;
    el.textContent = s.connected ? `Botga ulangan o'quvchilar: ${s.linked}${s.lastError ? ' · Oxirgi xato: ' + s.lastError : ''}` : 'Bot serverda topilmadi — tokenni qayta kiriting';
  }).catch(err => { const el = $('#bst'); if (el) { el.textContent = err.message; el.className = 'small bad'; } });
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText('https://t.me/' + c.username); toast('Nusxalandi'); } catch (e) { toast('https://t.me/' + c.username); } };
  $('#off').onclick = async () => {
    if (!(await confirmBox("Bot uziladi: o'quvchilar test yecha olmaydi.", 'Uzish'))) return;
    try { await TBot.call('disconnect'); } catch (e) {}
    delete DB.data.settings.bot; DB.save(); V.bot();
  };
  $('#bsend').onclick = async e => {
    const text = $('#btext').value.trim();
    const f = $('#bimg').files[0];
    if (!text && !f) { toast('Matn yozing', 'err'); return; }
    const gid = $('#bto').value;
    const chatIds = gid ? DB.data.students.filter(s => s.groupId === gid && s.tg).map(s => s.tg) : null;
    if (gid && !chatIds.length) { toast("Bu guruhda botga ulangan o'quvchi yo'q", 'err'); return; }
    let photo = null;
    if (f) { const cv = await loadImageFile(f); const k = Math.min(1, 1280 / Math.max(cv.width, cv.height)); const o = document.createElement('canvas'); o.width = Math.round(cv.width * k); o.height = Math.round(cv.height * k); o.getContext('2d').drawImage(cv, 0, 0, o.width, o.height); photo = o.toDataURL('image/jpeg', 0.85); }
    e.target.disabled = true; e.target.textContent = 'Yuborilmoqda…';
    try {
      const r = await TBot.call('broadcast', { text, photo, chatIds });
      DB.data.broadcasts.push({ id: DB.id(), at: Date.now(), text, photo: !!photo, to: gid ? DB.group(gid).name : 'Hammaga', sent: r.sent, failed: r.failed });
      DB.save(); toast(`Yuborildi: ${r.sent} ta${r.failed ? ', yetmadi: ' + r.failed : ''}`); V.bot();
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = 'Yuborish'; }
  };
};

/* Murojaatlar (apellyatsiya) */
V.appeals = function () {
  const list = (DB.data.appeals || []).slice().sort((a, b) => (!!a.reply - !!b.reply) || (b.at || 0) - (a.at || 0));
  const body = list.length ? list.map(a => {
    const st = a.studentId ? DB.student(a.studentId) : null;
    const t = a.testId ? DB.test(a.testId) : null;
    return `<div class="card"><div class="row"><b>${esc(st ? st.name : a.name || "O'quvchi")}</b><span class="sp"></span><span class="small muted">${new Date(a.at).toLocaleString()}</span></div>
      <div class="small muted">${t ? `<a href="#/test/${t.id}/natija">${esc(t.name)}</a>` : 'Umumiy savol'}</div>
      <p style="white-space:pre-wrap">${esc(a.text)}</p>
      ${a.reply ? `<div class="small ok">✓ Javob berilgan: ${esc(a.reply)}</div>` : `<textarea class="in" data-rt="${a.id}" rows="2" placeholder="Javobingiz…" style="font-family:inherit"></textarea><div class="btns"><button class="btn pri sm" data-rs="${a.id}">Javob yuborish</button><button class="btn sm" data-rx="${a.id}">Javobsiz yopish</button></div>`}
    </div>`;
  }).join('') : emptyBox('✉', "Murojaatlar yo'q. O'quvchilar botdagi \"✉️ Murojaat\" tugmasi orqali yozadi.");
  layout('Murojaatlar', body, { back: '#/more', tab: 'more' });
  $$('[data-rs]').forEach(b => b.onclick = async () => {
    const a = DB.data.appeals.find(x => x.id === b.dataset.rs);
    const txt = $(`[data-rt="${a.id}"]`).value.trim();
    if (!txt) { toast('Javob yozing', 'err'); return; }
    const t = a.testId ? DB.test(a.testId) : null;
    b.disabled = true;
    try {
      await TBot.call('notify', { items: [{ chatId: a.chatId, text: `✉️ O'qituvchi javobi${t ? ' (' + t.name + ')' : ''}:\n\n${txt}` }] });
      a.reply = txt; a.repliedAt = Date.now(); a.repliedBy = DB.me().id; DB.save(); toast('Yuborildi'); V.appeals();
    } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  });
  $$('[data-rx]').forEach(b => b.onclick = () => { const a = DB.data.appeals.find(x => x.id === b.dataset.rx); a.reply = '(yopildi)'; DB.save(); V.appeals(); });
};

/* Natijalar sahifasidagi bot kartochkasi */
function botCard(t, c, rows) {
  const cfg = TBot.cfg();
  const el = document.createElement('div');
  el.className = 'card';
  if (!cfg) {
    el.innerHTML = `<div class="row"><b>Telegram bot</b><span class="sp"></span>${DB.isAdmin() ? '<a class="btn sm" href="#/bot">Ulash</a>' : ''}</div><p class="small muted" style="margin:6px 0 0">O'quvchilar testni markaz botida yechib, natijani darhol olishadi.</p>`;
  } else {
    const open = t.bot === 'open';
    const withTg = (rows || []).filter(x => x.st && x.st.tg).length;
    el.innerHTML = `<div class="row"><b>Telegram bot</b><span class="sp"></span><span class="badge">${open ? 'Botda ochiq' : 'Yopiq'}</span></div>
      ${open ? `<p style="margin:8px 0 0">Test kodi: <b class="code">${esc(t.code)}</b> · <a href="https://t.me/${esc(cfg.username)}" target="_blank" rel="noopener">@${esc(cfg.username)}</a></p>` : `<p class="small muted" style="margin:6px 0 0">@${esc(cfg.username)}</p>`}
      <div class="btns">${open ? '<button class="btn sm" id="bclose">Botda yopish</button><button class="btn sm" id="bcopy">Kod va havolani nusxalash</button>' : '<button class="btn pri sm" id="bopen">Botda ochish</button>'}
        <button class="btn sm" id="bsync">⟳ Bot natijalarini olish</button>
        ${withTg ? `<button class="btn sm" id="bsend">Natijalarni Telegramga yuborish (${withTg})</button>` : ''}</div>`;
  }
  c.prepend(el);
  if (!cfg) return;
  const busy = (b, on) => { b.disabled = on; };
  if ($('#bopen', el)) $('#bopen', el).onclick = async () => {
    if (!t.variants.every(v => Core.keyComplete(t, v.key))) { toast("Avval javob kalitini to'liq kiriting", 'err'); return; }
    if (!t.code) t.code = TBot.code();
    t.bot = 'open'; DB.save(); await Cloud.push();
    toast('Test botda ochildi · kod ' + t.code); V.testDetail(t.id, 'natija');
  };
  if ($('#bclose', el)) $('#bclose', el).onclick = async () => { t.bot = 'closed'; DB.save(); await Cloud.push(); toast('Test botda yopildi'); V.testDetail(t.id, 'natija'); };
  if ($('#bcopy', el)) $('#bcopy', el).onclick = async () => {
    const s = `📝 ${t.name}\nTest kodi: ${t.code}\nBot: https://t.me/${cfg.username}`;
    try { await navigator.clipboard.writeText(s); toast('Nusxalandi'); } catch (e) { toast(s); }
  };
  $('#bsync', el).onclick = async e => { busy(e.target, true); await Cloud.pull(); busy(e.target, false); V.testDetail(t.id, 'natija'); };
  if ($('#bsend', el)) $('#bsend', el).onclick = async e => {
    if (!(await confirmBox(`${t.type === 'rasch' ? 'Rasch ball va darajalar' : 'Natijalar'} botga ulangan o'quvchilarga yuboriladi.`, 'Yuborish'))) return;
    busy(e.target, true);
    await TBot.notifyResults(t, rows.map(x => x.r));
    busy(e.target, false);
  };
}
