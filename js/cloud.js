/* Bulut sinxronlash: bir nechta qurilma (admin, o'qituvchilar) bitta markaz ma'lumotida ishlaydi.
   Server: api/sync.js (Upstash Redis). Server sozlanmagan bo'lsa ilova to'liq offline ishlayveradi. */
const Cloud = {
  _server: null, _timer: null, _busy: false, _again: false, status: 'idle', lastSync: null,

  async api(action, extra) {
    let r;
    try {
      r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, extra || {})) });
    } catch (e) { const err = new Error("Internetga ulanib bo'lmadi"); err.offline = true; throw err; }
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error('Server javob bermadi (' + r.status + ')'); }
    if (r.status === 409 && j.data) return Object.assign(j, { conflict: true });
    if (!r.ok || j.error) { const err = new Error(j.error || 'Xatolik ' + r.status); err.code = r.status; throw err; }
    return j;
  },
  async serverEnabled() {
    if (this._server !== null) return this._server;
    try { const r = await fetch('api/sync'); const j = await r.json(); this._server = !!j.enabled; }
    catch (e) { this._server = false; }
    return this._server;
  },

  /* Yuborish uchun: sessiya, bulut tokeni va skan rasmlari olib tashlanadi; gzip + base64. */
  async pack(d) {
    const clean = Object.assign({}, d, { session: null, cloud: null, results: (d.results || []).map(r => { const { image, ...x } = r; return x; }) });
    const json = JSON.stringify(clean);
    if (typeof CompressionStream === 'undefined') return 'j:' + json;
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return 'g:' + btoa(s);
  },
  async unpack(s) {
    if (!s) return null;
    if (s.startsWith('j:')) return JSON.parse(s.slice(2));
    const bin = atob(s.slice(2));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(ds).text());
  },

  async register() {
    const me = DB.me();
    const r = await this.api('register', { data: await this.pack(DB.data), userId: me && me.id });
    DB.data.cloud = { cid: r.cid, token: r.token, rev: r.rev };
    DB.save({ silent: true });
    this.lastSync = Date.now(); this.status = 'ok';
    this.start();
    return r;
  },
  async registerSilently() {
    if (!(await this.serverEnabled())) return;
    try { await this.register(); toast('Bulutga saqlandi ☁'); }
    catch (e) { if (e.code === 409) toast(e.message, 'err'); }
  },

  async login(phone, passHash) {
    if (!(await this.serverEnabled())) throw new Error("Telefon yoki parol noto'g'ri");
    const r = await this.api('login', { phone, pass: passHash });
    const d = await this.unpack(r.data);
    DB.replace(d);
    DB.data.cloud = { cid: r.cid, token: r.token, rev: r.rev };
    DB.data.session = { userId: r.userId };
    DB.save({ silent: true });
    this.lastSync = Date.now(); this.status = 'ok';
    this.start();
  },

  schedule() {
    if (!DB.data.cloud) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), 1500);
    this.status = 'dirty'; this.paint();
  },

  async push() {
    const c = DB.data.cloud; if (!c) return;
    if (this._busy) { this._again = true; return; }
    this._busy = true; this.status = 'sync'; this.paint();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await this.api('push', { token: c.token, baseRev: c.rev, data: await this.pack(DB.data) });
        if (r.conflict) {
          const remote = await this.unpack(r.data);
          DB.replace(Core.mergeData(DB.data, remote));
          DB.data.cloud.rev = r.rev;
          continue;
        }
        DB.data.cloud.rev = r.rev;
        DB.save({ silent: true });
        this.lastSync = Date.now(); this.status = 'ok';
        break;
      }
    } catch (e) {
      this.status = e.offline ? 'offline' : 'err';
      if (e.code === 401) { DB.data.cloud = null; DB.save({ silent: true }); toast('Bulut sessiyasi tugadi — Yana → Bulut orqali qayta ulang', 'err'); }
    }
    this._busy = false; this.paint();
    if (this._again) { this._again = false; this.schedule(); }
  },

  async pull(opts = {}) {
    const c = DB.data.cloud; if (!c || this._busy) return;
    this._busy = true; this.status = 'sync'; this.paint();
    let changed = false;
    try {
      const r = await this.api('pull', { token: c.token, rev: c.rev });
      if (r.data) {
        const remote = await this.unpack(r.data);
        const merged = Core.mergeData(DB.data, remote);
        const strip = d => JSON.stringify(['users', 'groups', 'students', 'tests', 'results', 'appeals'].map(k => (d[k] || []).map(x => x.id + (x._u || ''))));
        const needPush = strip(merged) !== strip(remote);
        DB.replace(merged);
        DB.data.cloud.rev = r.rev;
        DB.save({ silent: true });
        changed = true;
        if (needPush) this._again = true;
      }
      if (r.bot && (!DB.data.settings.bot || DB.data.settings.bot.username !== r.bot.username)) { DB.data.settings.bot = { username: r.bot.username }; DB.save({ silent: true }); }
      if (!r.bot && DB.data.settings.bot) { delete DB.data.settings.bot; DB.save({ silent: true }); }
      if (r.inbox && r.inbox.length) {
        const n = this.applyInbox(r.inbox);
        DB.save({ silent: true });
        this._again = true;
        await this.api('ack', { token: c.token, n: r.inboxN });
        if (n && !opts.quiet) toast(`Botdan ${n} ta yangi ma'lumot keldi`);
        changed = true;
      }
      this.lastSync = Date.now(); this.status = 'ok';
    } catch (e) {
      this.status = e.offline ? 'offline' : 'err';
      if (e.code === 401) { DB.data.cloud = null; DB.save({ silent: true }); }
    }
    this._busy = false; this.paint();
    if (this._again) { this._again = false; this.push(); }
    if (changed) this.refreshView();
  },

  /* Botdan kelgan yozuvlar: bog'lanish, natija, murojaat. */
  applyInbox(items) {
    let n = 0;
    const findSt = it => (it.studentId && DB.student(it.studentId)) || DB.data.students.find(s => String(s.tg) === String(it.chatId)) || (it.phone && DB.data.students.find(s => s.phone === it.phone)) || null;
    const ensureSt = it => {
      let st = findSt(it);
      if (!st) {
        st = DB.student('tg' + it.chatId);
        if (!st) { st = { id: 'tg' + it.chatId, name: it.name || 'Telegram o‘quvchi', phone: it.phone || '', groupId: '', certs: [], createdAt: new Date().toISOString(), fromBot: true }; DB.data.students.push(st); }
      }
      st.tg = String(it.chatId);
      if (st.fromBot && it.name) st.name = it.name;
      return st;
    };
    for (const it of items) {
      if (it.type === 'link') { ensureSt(it); n++; }
      else if (it.type === 'result') {
        const t = DB.test(it.testId); if (!t) continue;
        const st = ensureSt(it);
        const ex = DB.data.results.find(r => r.testId === t.id && r.studentId === st.id);
        if (ex && ex.source !== 'bot') continue;
        const r = ex || { id: 'b' + it.id, testId: t.id, studentId: st.id };
        if (!ex) DB.data.results.push(r);
        Object.assign(r, { variant: it.variant, answers: it.answers, source: 'bot', openText: it.openText || {}, scannedAt: new Date(it.at || Date.now()).toISOString() });
        n++;
      } else if (it.type === 'appeal') {
        if (DB.data.appeals.some(a => a.id === it.id)) continue;
        const st = findSt(it);
        DB.data.appeals.push({ id: it.id, chatId: it.chatId, studentId: st ? st.id : null, name: it.name, testId: it.testId, text: it.text, at: it.at });
        n++;
      }
    }
    return n;
  },

  refreshView() {
    const h = location.hash || '';
    if ($('#modal-root').children.length || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) return;
    if (/^#\/(home|tests|students|appeals|groups|bot)?$/.test(h) || /^#\/test\/\w+(\/natija|\/tahlil)?$/.test(h) || /^#\/student\//.test(h)) route();
  },

  start() {
    if (this._started || !DB.data.cloud) return;
    this._started = true;
    this.pull({ quiet: true });
    setInterval(() => { if (document.visibilityState === 'visible') this.pull(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pull(); });
    window.addEventListener('online', () => this.push());
  },

  badge() {
    if (!DB.data || !DB.data.cloud) return '';
    const m = { ok: ['☁', 'Sinxronlangan'], sync: ['⟳', 'Sinxronlanmoqda'], dirty: ['⟳', 'Saqlanmoqda'], offline: ['☁̸', 'Internet yo‘q — keyin yuboriladi'], err: ['⚠', 'Sinxron xatosi'], idle: ['☁', ''] }[this.status] || ['☁', ''];
    const svg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 19a5 5 0 0 1-.6-9.96A6.5 6.5 0 0 1 19 9.5a4.75 4.75 0 0 1-.25 9.5H7z"/></svg>`;
    return `<a href="#/cloud" class="cloudb ${this.status}" title="${m[1]}" aria-label="${m[1]}">${svg}</a>`;
  },
  paint() {
    const el = $('.cloudb'); if (!el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = this.badge();
    if (tmp.firstChild) el.replaceWith(tmp.firstChild);
  }
};

V.cloud = async function () {
  const c = DB.data.cloud;
  const draw = srv => {
    const body = !srv ? `<div class="card"><h3>Bulut hali sozlanmagan</h3>
        <p class="small">Ma'lumotlar hozircha faqat shu qurilmada. Bir nechta telefondan ishlash, o'qituvchilar kirishi va Telegram bot uchun serverda bepul ma'lumotlar bazasi ulanishi kerak:</p>
        <ol class="small" style="padding-left:18px"><li>Vercel → loyiha → <b>Storage</b> → <b>Create Database</b> → <b>Upstash for Redis</b> (Free) → loyihaga ulang.</li>
        <li>Vercel → <b>Deployments</b> → oxirgi deploy → <b>Redeploy</b>.</li><li>Shu sahifani yangilang.</li></ol></div>`
      : c ? `<div class="card"><h3>Bulut yoqilgan ☁</h3>
        <p class="small muted">Barcha o'zgarishlar avtomatik saqlanadi. Boshqa telefonda shu telefon raqami va parol bilan kirsangiz, ma'lumotlar yuklanadi. O'qituvchilar ham o'z raqami bilan kira oladi.</p>
        <p class="small">Holat: <b>${{ ok: 'sinxronlangan', sync: 'sinxronlanmoqda…', dirty: 'saqlanmoqda…', offline: "internet yo'q", err: 'xatolik', idle: '—' }[Cloud.status]}</b>${Cloud.lastSync ? ' · ' + new Date(Cloud.lastSync).toLocaleTimeString() : ''}</p>
        <div class="btns"><button class="btn pri" id="now">⟳ Hozir sinxronlash</button><button class="btn danger" id="off">Shu qurilmada o'chirish</button></div></div>`
      : `<div class="card"><h3>Bulutga ulash</h3><p class="small">Ma'lumotlaringiz serverga saqlanadi: telefon yo'qolsa ham yo'qolmaydi, o'qituvchilar o'z telefonidan kiradi, Telegram bot ishlaydi.</p>
        <button class="btn pri block" id="reg">☁ Bulutga ulash</button>
        <p class="small muted">Agar bu markaz boshqa telefonda allaqachon bulutga ulangan bo'lsa, chiqib, telefon raqam va parol bilan qayta kiring.</p></div>`;
    layout('Bulut sinxronlash', body, { back: '#/more', tab: 'more' });
    if ($('#reg')) $('#reg').onclick = async e => { e.target.disabled = true; try { await Cloud.register(); toast('Bulutga ulandi'); V.cloud(); } catch (err) { toast(err.message, 'err'); e.target.disabled = false; } };
    if ($('#now')) $('#now').onclick = async () => { await Cloud.push(); await Cloud.pull(); V.cloud(); };
    if ($('#off')) $('#off').onclick = async () => { if (await confirmBox("Shu qurilmada sinxronlash to'xtatiladi (bulutdagi ma'lumot qoladi).", "To'xtatish")) { DB.data.cloud = null; DB.save({ silent: true }); V.cloud(); } };
  };
  layout('Bulut sinxronlash', '<p class="muted">Tekshirilmoqda…</p>', { back: '#/more', tab: 'more' });
  draw(await Cloud.serverEnabled());
};
