/* Hash router. */
const ROUTES = [
  [/^#\/home$/, () => V.home()],
  [/^#\/tests$/, () => V.tests()],
  [/^#\/test-new$/, () => V.testForm()],
  [/^#\/test-edit\/(\w+)$/, m => V.testForm(m[1])],
  [/^#\/test\/(\w+)(?:\/(\w+))?$/, m => V.testDetail(m[1], m[2])],
  [/^#\/result\/(\w+)$/, m => V.result(m[1])],
  [/^#\/scan(?:\/(\w+))?$/, m => Scan.view(m[1])],
  [/^#\/students$/, () => V.students()],
  [/^#\/student\/(\w+)$/, m => V.student(m[1])],
  [/^#\/groups$/, () => V.groups()],
  [/^#\/teachers$/, () => V.teachers()],
  [/^#\/more$/, () => V.more()],
  [/^#\/settings$/, () => V.settings()],
  [/^#\/backup$/, () => V.backup()],
  [/^#\/help$/, () => V.help()]
];

function route() {
  Scan.stop();
  $('#modal-root').innerHTML = '';
  DB.load();
  const h = location.hash || '#/home';
  if (!DB.data.center) { if (h !== '#/register') { location.replace('#/register'); return; } return V.register(); }
  if (h === '#/register') return V.register();
  if (!DB.me()) { if (h !== '#/login') { location.replace('#/login'); return; } return V.login(); }
  if (h === '#/login') { location.replace('#/home'); return; }
  for (const [re, fn] of ROUTES) { const m = h.match(re); if (m) { try { fn(m); } catch (e) { console.error(e); toast('Xatolik: ' + e.message, 'err'); } return; } }
  location.replace('#/home');
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
