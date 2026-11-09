/* Telegram bot integration (client side). Server: /api/bot (admin) and /api/tg (webhook). */
const TBot = {
  cfg() { return DB.data.settings.bot || null; },
  async call(action, extra) {
    const c = this.cfg() || {};
    let r;
    try {
      r = await fetch('api/bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action, cid: c.cid, key: c.key }, extra || {})) });
    } catch (e) { throw new Error("Internetga ulanib bo'lmadi"); }
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error('Server javob bermadi (' + r.status + ')'); }
    if (!r.ok || j.error) throw new Error(j.error || 'Xatolik ' + r.status);
    return j;
  },

  publishable(t) {
    return {
      id: t.id, name: t.name, type: t.type, date: t.date,
      sections: t.sections.map(s => ({ title: s.title, count: s.count, weight: s.weight })),
      variants: t.variants.map(v => ({ code: v.code, key: v.key }))
    };
  },

  norm(s) { return latin(s).toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim(); },

  /* Pull bot submissions into local results. Returns {added, matched, guests}. */
  async sync(t) {
    const { results } = await this.call('results', { testId: t.id });
    const pool = DB.studentsOfGroups(t.groupIds).length ? DB.studentsOfGroups(t.groupIds) : DB.myStudents();
    const byName = new Map();
    pool.forEach(s => { const k = this.norm(s.name); if (!byName.has(k)) byName.set(k, s); else byName.set(k, null); });
    let matched = 0, guests = 0;
    for (const row of results) {
      const n = Scoring.qCount(t);
      const answers = String(row.answers || '').slice(0, n).padEnd(n, '-');
      const variant = t.variants.some(v => v.code === row.variant) ? row.variant : t.variants[0].code;
      const k = this.norm(row.name);
      let st = byName.get(k);
      if (!st) { // try "Familiya Ism" swapped
        const sw = k.split(' ').reverse().join(' ');
        st = byName.get(sw) || null;
      }
      if (st) {
        const ex = DB.data.results.find(x => x.testId === t.id && x.studentId === st.id);
        if (ex && ex.source !== 'bot') continue; // a scanned paper sheet wins
        saveResult(t, st.id, variant, answers, 'bot');
        const r = DB.data.results.find(x => x.testId === t.id && x.studentId === st.id);
        r.tgId = row.tgId; matched++;
      } else {
        let r = DB.data.results.find(x => x.testId === t.id && x.tgId === row.tgId);
        if (!r) { r = { id: DB.id(), testId: t.id, studentId: '', tgId: row.tgId }; DB.data.results.push(r); }
        Object.assign(r, { guestName: row.name + (row.username ? ' (@' + row.username + ')' : ''), variant, answers, source: 'bot', scannedAt: row.at || new Date().toISOString() });
        guests++;
      }
    }
    DB.save();
    return { total: results.length, matched, guests };
  }
};

V.bot = function () {
  if (!DB.isAdmin()) { location.hash = '#/more'; return; }
  const c = TBot.cfg();
  const body = c ? `<div class="card"><h3>Bot ulangan ✓</h3>
        <p><a href="https://t.me/${esc(c.username)}" target="_blank" rel="noopener">@${esc(c.username)}</a> — bu havolani o'quvchilarga yuboring.</p>
        <p class="small muted" id="bst">Holat tekshirilmoqda…</p>
        <div class="btns"><button class="btn" id="copy">Havolani nusxalash</button><button class="btn danger" id="off">Botni uzish</button></div></div>
      <div class="card"><h3>Qanday ishlaydi</h3><ol class="small" style="padding-left:18px;margin:0">
        <li>Test sahifasi → Natijalar → <b>Botda ochish</b>.</li>
        <li>O'quvchi botda ism-familiyasini yozadi, testni tanlaydi va javoblarini bitta xabarda yuboradi (<code>abcd…</code> yoki <code>1a 2b…</code>).</li>
        <li>Natija darhol botda chiqadi: to'g'ri javoblar, fanlar bo'yicha ball, xato savollar.</li>
        <li>Ilovada <b>Bot natijalarini yuklash</b> — natijalar reytingga qo'shiladi (ism bo'yicha o'quvchiga bog'lanadi).</li></ol></div>
      <div class="card"><h3>Tokenni almashtirish</h3><div class="row"><input class="in" id="tok" placeholder="Yangi bot token"><button class="btn" id="re">Ulash</button></div></div>`
    : `<div class="card"><h3>1. Bot yarating</h3><ol class="small" style="padding-left:18px;margin:0">
        <li>Telegramda <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> ni oching va <code>/newbot</code> yuboring.</li>
        <li>Bot nomini (masalan: <i>${esc(DB.data.center.name)} testlar</i>) va <code>…_bot</code> bilan tugaydigan username kiriting.</li>
        <li>BotFather bergan <b>token</b>ni nusxalang (<code>123456789:AA…</code>).</li></ol></div>
      <div class="card"><h3>2. Tokenni kiriting</h3>
        <label class="f"><span>Bot token</span><input class="in" id="tok" placeholder="123456789:AA..." autocomplete="off"></label>
        <button class="btn pri block" id="re">Botni ulash</button>
        <p class="small muted">Token faqat serverda saqlanadi va faqat shu bot uchun ishlatiladi.</p></div>`;
  layout('Telegram bot', body, { back: '#/more', tab: 'more' });

  $('#re').onclick = async e => {
    const token = $('#tok').value.trim();
    if (!token) { toast('Token kiriting', 'err'); return; }
    e.target.disabled = true;
    try {
      const r = await TBot.call('setup', { token, name: DB.data.center.name });
      DB.data.settings.bot = { cid: r.cid, key: r.key, username: r.username };
      DB.save(); toast('Bot ulandi: @' + r.username); V.bot();
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
  };
  if (!c) return;
  TBot.call('status', { name: DB.data.center.name }).then(s => {
    const el = $('#bst'); if (el) el.textContent = `Botda ochiq testlar: ${s.open.length}`;
  }).catch(err => { const el = $('#bst'); if (el) { el.textContent = err.message; el.className = 'small bad'; } });
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText('https://t.me/' + c.username); toast('Nusxalandi'); } catch (e) { toast('https://t.me/' + c.username); } };
  $('#off').onclick = async () => {
    if (!(await confirmBox("Bot uziladi: o'quvchilar test yecha olmaydi.", 'Uzish'))) return;
    try { await TBot.call('disconnect'); } catch (e) {}
    delete DB.data.settings.bot; DB.save(); V.bot();
  };
};

/* Card shown on the test results tab */
function botCard(t, c) {
  const cfg = TBot.cfg();
  const el = document.createElement('div');
  el.className = 'card';
  if (!cfg) {
    el.innerHTML = `<div class="row"><b>Telegram bot</b><span class="sp"></span>${DB.isAdmin() ? '<a class="btn sm" href="#/bot">Ulash</a>' : ''}</div><p class="small muted" style="margin:6px 0 0">O'quvchilar testni markaz botida yechib, natijani darhol olishadi.</p>`;
  } else {
    const open = t.bot === 'open';
    el.innerHTML = `<div class="row"><b>Telegram bot</b><span class="sp"></span><span class="badge">${open ? 'Botda ochiq' : 'Yopiq'}</span></div>
      <p class="small muted" style="margin:6px 0 0">@${esc(cfg.username)}</p>
      <div class="btns">${open ? '<button class="btn sm" id="bclose">Botda yopish</button>' : '<button class="btn pri sm" id="bopen">Botda ochish</button>'}<button class="btn sm" id="bsync">Bot natijalarini yuklash</button></div>`;
  }
  c.prepend(el);
  if (!cfg) return;
  const busy = (b, on) => { b.disabled = on; };
  if ($('#bopen', el)) $('#bopen', el).onclick = async e => {
    if (t.variants.some(v => v.key.includes('-'))) { toast("Avval javob kalitini to'liq kiriting", 'err'); return; }
    busy(e.target, true);
    try { await TBot.call('publish', { test: TBot.publishable(t) }); t.bot = 'open'; DB.save(); toast('Test botda ochildi'); V.testDetail(t.id, 'natija'); }
    catch (err) { toast(err.message, 'err'); busy(e.target, false); }
  };
  if ($('#bclose', el)) $('#bclose', el).onclick = async e => {
    busy(e.target, true);
    try { await TBot.call('close', { testId: t.id }); t.bot = 'closed'; DB.save(); toast('Test botda yopildi'); V.testDetail(t.id, 'natija'); }
    catch (err) { toast(err.message, 'err'); busy(e.target, false); }
  };
  $('#bsync', el).onclick = async e => {
    busy(e.target, true);
    try { const r = await TBot.sync(t); toast(`Botdan ${r.total} ta natija: ${r.matched} ta o'quvchiga bog'landi${r.guests ? ', ' + r.guests + ' ta yangi ism' : ''}`); V.testDetail(t.id, 'natija'); }
    catch (err) { toast(err.message, 'err'); busy(e.target, false); }
  };
}
