/* Local-first data store (localStorage). One learning center per device. */
const DB_KEY = 'testvaraq_db_v1';

const SUBJECTS = [
  'Ona tili va adabiyot', 'Matematika', "O'zbekiston tarixi", 'Fizika', 'Kimyo', 'Biologiya',
  'Ingliz tili', 'Rus tili', 'Nemis tili', 'Fransuz tili', 'Geografiya', 'Jahon tarixi',
  'Huquq', 'Informatika', 'Qoraqalpoq tili', 'Ona tili (rus)'
];
const GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

const DB = {
  data: null,
  empty() {
    return {
      v: 1, center: null, users: [], groups: [], students: [], tests: [], results: [],
      settings: { certPercent: { 'A+': 100, 'A': 100, 'B+': 100, 'B': 100, 'C+': 100, 'C': 100 } },
      session: null
    };
  },
  load() {
    try { this.data = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.data = null; }
    if (!this.data || typeof this.data !== 'object') this.data = this.empty();
    const e = this.empty();
    for (const k in e) if (this.data[k] === undefined) this.data[k] = e[k];
    return this.data;
  },
  save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); }
    catch (e) { toast("Xotira to'ldi: eski natijalarni o'chiring yoki zaxira oling", 'err'); }
  },
  id() { return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); },

  me() { const s = this.data.session; return s ? this.data.users.find(u => u.id === s.userId) : null; },
  isAdmin() { const u = this.me(); return !!u && u.role === 'admin'; },

  user(id) { return this.data.users.find(x => x.id === id); },
  group(id) { return this.data.groups.find(x => x.id === id); },
  student(id) { return this.data.students.find(x => x.id === id); },
  test(id) { return this.data.tests.find(x => x.id === id); },
  result(id) { return this.data.results.find(x => x.id === id); },

  /* groups the current user may see: admin -> all, teacher -> own */
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
    return this.data.tests.filter(t => t.createdBy === u.id || (t.groupIds || []).some(g => ids.has(g)));
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
    const d = Object.assign({}, this.data, { session: null, exportedAt: new Date().toISOString() });
    return new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  },
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.tests) || !Array.isArray(d.students)) throw new Error('Fayl formati noto‘g‘ri');
    const session = this.data.session;
    this.data = d;
    const e = this.empty(); for (const k in e) if (this.data[k] === undefined) this.data[k] = e[k];
    this.data.session = session && this.data.users.some(u => u.id === session.userId) ? session : null;
    this.save();
  }
};
