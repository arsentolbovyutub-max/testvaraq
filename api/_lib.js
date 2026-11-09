/* Shared server helpers: Upstash Redis (REST), Telegram Bot API, scoring. No npm dependencies. */
const crypto = require('crypto');

function redisCfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(...cmd) {
  const c = redisCfg();
  if (!c) throw new Error('NO_DB');
  const r = await fetch(c.url, { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}
async function getJ(key) { const v = await redis('GET', key); return v ? JSON.parse(v) : null; }
async function setJ(key, val) { return redis('SET', key, JSON.stringify(val)); }

async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

const rand = (n = 24) => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ---------- scoring (mirrors js/scoring.js) ---------- */
const r1 = x => Math.round(x * 10) / 10;
const qCount = t => t.sections.reduce((a, s) => a + s.count, 0);
const maxPoints = t => r1(t.sections.reduce((a, s) => a + s.count * s.weight, 0));

function evaluate(t, variant, answers) {
  const v = t.variants.find(x => x.code === variant) || t.variants[0];
  let start = 0, points = 0, correct = 0;
  const sections = t.sections.map(s => {
    let c = 0;
    for (let i = start; i < start + s.count; i++) if (answers[i] && answers[i] === v.key[i]) c++;
    start += s.count;
    const p = r1(c * s.weight);
    points += p; correct += c;
    return { title: s.title, count: s.count, correct: c, points: p, max: r1(s.count * s.weight) };
  });
  points = r1(points);
  const max = maxPoints(t);
  return { correct, total: qCount(t), points, max, percent: max ? Math.round(points / max * 100) : 0, sections };
}

function grade(T) {
  if (T >= 70) return 'A+'; if (T >= 65) return 'A'; if (T >= 60) return 'B+';
  if (T >= 55) return 'B'; if (T >= 50) return 'C+'; if (T >= 46) return 'C'; return '—';
}

/* Rasch (1PL, JML) over all submissions; returns T for each row index. */
function rasch(t, rows) {
  const n = qCount(t), P = rows.length;
  const X = rows.map(r => { const v = t.variants.find(x => x.code === r.variant) || t.variants[0]; return Array.from({ length: n }, (_, i) => r.answers[i] && r.answers[i] === v.key[i] ? 1 : 0); });
  const raw = X.map(x => x.reduce((a, b) => a + b, 0));
  if (P < 3) return raw.map(s => { const T = r1(75 * s / (n || 1)); return { T, grade: grade(T) }; });
  const s = Array.from({ length: n }, (_, i) => X.reduce((a, x) => a + x[i], 0));
  const aI = s.map(v => v > 0 && v < P), nA = aI.filter(Boolean).length;
  const rA = X.map(x => x.reduce((a, v, i) => a + (aI[i] ? v : 0), 0));
  const aP = rA.map(v => v > 0 && v < nA);
  const th = rA.map((v, p) => aP[p] ? Math.log(v / (nA - v)) : 0);
  const b = s.map((v, i) => aI[i] ? Math.log((P - v) / v) : 0);
  for (let it = 0; it < 200; it++) {
    let md = 0;
    for (let p = 0; p < P; p++) { if (!aP[p]) continue; let e = 0, w = 0; for (let i = 0; i < n; i++) { if (!aI[i]) continue; const q = 1 / (1 + Math.exp(b[i] - th[p])); e += q; w += q * (1 - q); } const d = Math.max(-1, Math.min(1, (rA[p] - e) / (w || 1))); th[p] += d; md = Math.max(md, Math.abs(d)); }
    let m = 0;
    for (let i = 0; i < n; i++) { if (!aI[i]) continue; let e = 0, w = 0; for (let p = 0; p < P; p++) { if (!aP[p]) continue; const q = 1 / (1 + Math.exp(b[i] - th[p])); e += q; w += q * (1 - q); } let o = 0; for (let p = 0; p < P; p++) if (aP[p]) o += X[p][i]; const d = Math.max(-1, Math.min(1, (e - o) / (w || 1))); b[i] += d; md = Math.max(md, Math.abs(d)); m += b[i]; }
    m /= (nA || 1); for (let i = 0; i < n; i++) if (aI[i]) b[i] -= m;
    if (md < 1e-4) break;
  }
  const corr = nA > 1 ? (nA - 1) / nA : 1;
  const act = th.filter((_, p) => aP[p]).map(x => x * corr);
  const lo = act.length ? Math.min(...act) - 1 : -3, hi = act.length ? Math.max(...act) + 1 : 3;
  const T0 = th.map((x, p) => aP[p] ? x * corr : (rA[p] <= 0 ? lo : hi));
  const mu = T0.reduce((a, x) => a + x, 0) / P;
  const sd = Math.sqrt(T0.reduce((a, x) => a + (x - mu) ** 2, 0) / P) || 1;
  return T0.map(x => { const T = r1(Math.max(0, Math.min(75, 50 + 10 * (x - mu) / sd))); return { T, grade: grade(T) }; });
}

/* Parse a student's answer message: "abcd..." or "1a 2b 3c ..." */
function parseAnswers(text, n) {
  const s = String(text || '').toUpperCase();
  if (/\d/.test(s)) {
    const arr = new Array(n).fill('-');
    let found = 0;
    const re = /(\d{1,3})\s*[\.\)\-:]?\s*([ABCD])/g;
    let m;
    while ((m = re.exec(s))) { const q = parseInt(m[1], 10) - 1; if (q >= 0 && q < n) { arr[q] = m[2]; found++; } }
    return found ? { answers: arr.join(''), count: found } : null;
  }
  const letters = s.replace(/[^ABCD]/g, '');
  if (!letters) return null;
  return { answers: letters.slice(0, n).padEnd(n, '-'), count: letters.length };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise(res => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { res({}); } }); });
}

module.exports = { redis, redisCfg, getJ, setJ, tg, rand, sha, esc, evaluate, rasch, grade, qCount, maxPoints, parseAnswers, readBody };
