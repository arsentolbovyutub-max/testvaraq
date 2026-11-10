/* Local-first ma'lumotlar ombori (localStorage) + bulut bilan sinxronlash uchun o'zgarishlarni belgilash. */
const DB_KEY = 'testvaraq_db_v1';
const COLL = ['users', 'groups', 'students', 'tests', 'results', 'appeals', 'broadcasts'];

const SUBJECTS = [
  'Ona tili va adabiyot', 'Matematika', "O'zbekiston tarixi", 'Fizika', 'Kimyo', 'Biologiya',
  'Ingliz tili', 'Rus tili', 'Nemis tili', 'Fransuz tili', 'Geografiya', 'Jahon tarixi',
  'Huquq', 'Informatika', 'Qoraqalpoq tili', 'Ona tili (rus)', 'Boshqa'
];
const GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

const DB = {
  data: null,
  _snap: null,
  empty() {
    return {
      v: 2, center: null, users: [], groups: [], students: [], tests: [], results: [], appeals: [], broadcasts: [],
      settings: { autoNotify: true },
      deleted: {}, _cu: 0,
      session: null, cloud: null
    };
  },
  load() {
    try { this.data = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.data = null; }
    if (!this.data || typeof this.data !== 'object') this.data = this.empty();
    const e = this.empty();
    for (const k in e) if (this.data[k] === undefined) this.data[k] = e[k];
    this.migrate();
    if (!this._snap) this._snap = this.snapshot();
    return this.data;
  },
  /* Eski ma'lumotlarni yangi tuzilmaga o'tkazish. */
  migrate() {
    const d = this.data;
    if (d.v >= 2) return;
    d.tests.forEach(t => {
      t.sections.forEach((s, i) => {
        if (!s.kind) s.kind = 'choice';
        if (!s.options) s.options = 4;
        if (t.type === 'block' && i < 3) s.mandatory = true;
      });
    });
    if (d.settings && d.settings.certPercent) delete d.settings.certPercent;
    if (d.settings && d.settings.bot && d.settings.bot.key) delete d.settings.bot; // eski bot sozlamasi: yangi tizimda qayta ulanadi
    d.v = 2;
  },
  snapshot() {
    const m = new Map();
    for (const k of COLL) for (const it of this.data[k] || []) m.set(it.id, this.sig(it));
    m.set('__c', JSON.stringify([this.data.center, this.data.settings]));
    return m;
  },
  sig(it) { const { _u, image, ...rest } = it; return JSON.stringify(rest); },
  /* Saqlash: o'zgargan yozuvlarga vaqt belgisi, o'chirilganlarni qayd qilish, bulutga yuborishni rejalash. */
  save(opts = {}) {
    const now = Date.now();
    const prev = this._snap || new Map();
    const seen = new Set();
    for (const k of COLL) for (const it of this.data[k] || []) {
      seen.add(it.id);
      const s = this.sig(it);
      if (prev.get(it.id) !== s) it._u = now;
    }
    for (const id of prev.keys()) if (id !== '__c' && !seen.has(id)) this.data.deleted[id] = now;
    const c = JSON.stringify([this.data.center, this.data.settings]);
    if (prev.get('__c') !== c) this.data._cu = now;
    this._snap = this.snapshot();
    try { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); }
    catch (e) { toast("Xotira to'ldi: eski natijalarni o'chiring yoki zaxira oling", 'err'); }
    if (!opts.silent && typeof Cloud !== 'undefined') Cloud.schedule();
  },
  /* Bulutdan kelgan ma'lumotni joriy holatga qo'shish (o'zgarish belgilarini buzmasdan). */
  replace(d) {
    const session = this.data.session, cloud = this.data.cloud;
    this.data = d;
    const e = this.empty();
    for (const k in e) if (this.data[k] === undefined) this.data[k] = e[k];
    this.data.session = session; this.data.cloud = cloud;
    this.migrate();
    this._snap = this.snapshot();
    try { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); } catch (err) {}
  },
  id() { return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); },

  me() { const s = this.data.session; return s ? this.data.users.find(u => u.id === s.userId) : null; },
  isAdmin() { const u = this.me(); return !!u && u.role === 'admin'; },

  user(id) { return this.data.users.find(x => x.id === id); },
  group(id) { return this.data.groups.find(x => x.id === id); },
  student(id) { return this.data.students.find(x => x.id === id); },
  test(id) { return this.data.tests.find(x => x.id === id); },
  result(id) { return this.data.results.find(x => x.id === id); },

  myGroups() {
    const u = this.me();
    if (!u) return [];
    if (u.role === 'admin') return this.data.groups;
    return this.data.groups.filter(g => g.teacherId === u.id);
  },
  myStudents() {
    if (this.isAdmin()) return this.data.students;
    const ids = new Set(this.myGroups().map(g => g.id));
    return this.data.students.filter(s => ids.has(s.groupId));
  },
  myTests() {
    if (this.isAdmin()) return this.data.tests;
    const u = this.me(); const ids = new Set(this.myGroups().map(g => g.id));
    return this.data.tests.filter(t => t.createdBy === u.id || (t.teacherIds || []).includes(u.id) || (t.groupIds || []).some(g => ids.has(g)));
  },
  studentsOfGroups(groupIds) {
    const set = new Set(groupIds || []);
    return this.data.students.filter(s => set.has(s.groupId)).sort((a, b) => a.name.localeCompare(b.name));
  },
  resultsOfTest(testId) { return this.data.results.filter(r => r.testId === testId); },
  resultsOfStudent(studentId) { return this.data.results.filter(r => r.studentId === studentId); },

  removeStudent(id) {
    this.data.students = this.data.students.filter(s => s.id !== id);
    this.data.results = this.data.results.filter(r => r.studentId !== id);
  },
  removeGroup(id) {
    this.data.groups = this.data.groups.filter(g => g.id !== id);
    this.data.students.forEach(s => { if (s.groupId === id) s.groupId = ''; });
    this.data.tests.forEach(t => { t.groupIds = (t.groupIds || []).filter(g => g !== id); });
  },
  removeTest(id) {
    this.data.tests = this.data.tests.filter(t => t.id !== id);
    this.data.results = this.data.results.filter(r => r.testId !== id);
  },

  exportJSON() {
    const d = Object.assign({}, this.data, { session: null, cloud: null, exportedAt: new Date().toISOString() });
    return new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  },
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.tests) || !Array.isArray(d.students)) throw new Error('Fayl formati noto‘g‘ri');
    const session = this.data.session, cloud = this.data.cloud;
    this.data = d;
    const e = this.empty(); for (const k in e) if (this.data[k] === undefined) this.data[k] = e[k];
    this.data.session = session && this.data.users.some(u => u.id === session.userId) ? session : null;
    this.data.cloud = cloud;
    this.migrate();
    this._snap = new Map();
    this.save();
  }
};
