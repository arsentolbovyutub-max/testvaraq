/* Server uchun umumiy yordamchilar: Upstash Redis (REST), ma'lumotlarni siqish, token, Telegram API. */
const zlib = require('zlib');
const crypto = require('crypto');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const enabled = () => !!(KV_URL && KV_TOKEN);

/* Test uchun: xotiradagi Redis o'rnini bosuvchi (TV_MEMORY_KV=1). */
const mem = new Map();
async function memCmd(cmd) {
  const [op, k, ...a] = cmd.map(x => (typeof x === 'number' ? String(x) : x));
  const O = op.toUpperCase();
  const get = () => mem.get(k);
  switch (O) {
    case 'GET': return get() ?? null;
    case 'SET': mem.set(k, a[0]); return 'OK';
    case 'DEL': return mem.delete(k) ? 1 : 0;
    case 'EXISTS': return mem.has(k) ? 1 : 0;
    case 'RPUSH': { const l = get() || []; l.push(...a); mem.set(k, l); return l.length; }
    case 'LRANGE': { const l = get() || []; const s = +a[0], e = +a[1]; return l.slice(s, e === -1 ? undefined : e + 1); }
    case 'LTRIM': { const l = get() || []; const s = +a[0], e = +a[1]; mem.set(k, l.slice(s, e === -1 ? undefined : e + 1)); return 'OK'; }
    case 'LLEN': return (get() || []).length;
    case 'HSET': { const h = get() || {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; mem.set(k, h); return 1; }
    case 'HGET': return (get() || {})[a[0]] ?? null;
    case 'HDEL': { const h = get() || {}; delete h[a[0]]; mem.set(k, h); return 1; }
    case 'HKEYS': return Object.keys(get() || {});
    case 'HLEN': return Object.keys(get() || {}).length;
    case 'HGETALL': { const h = get() || {}; return Object.entries(h).flat(); }
    case 'SADD': { const s = new Set(get() || []); const n = s.size; a.forEach(x => s.add(x)); mem.set(k, [...s]); return s.size - n; }
    case 'SISMEMBER': return (get() || []).includes(a[0]) ? 1 : 0;
    case 'EXPIRE': return 1;
    case 'INCR': { const v = (+get() || 0) + 1; mem.set(k, String(v)); return v; }
    default: throw new Error('memkv: ' + O);
  }
}

async function kv(...cmd) {
  if (process.env.TV_MEMORY_KV) return memCmd(cmd);
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd.map(x => (typeof x === 'number' ? String(x) : x))) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

/* Ma'lumot: 'g:' + base64(gzip(JSON)) yoki 'j:' + JSON */
function unpack(s) {
  if (!s) return null;
  if (s.startsWith('g:')) return JSON.parse(zlib.gunzipSync(Buffer.from(s.slice(2), 'base64')).toString('utf8'));
  if (s.startsWith('j:')) return JSON.parse(s.slice(2));
  return JSON.parse(s);
}
function pack(obj) { return 'g:' + zlib.gzipSync(Buffer.from(JSON.stringify(obj))).toString('base64'); }

const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
const K = {
  data: cid => `tv:c:${cid}:data`,
  rev: cid => `tv:c:${cid}:rev`,
  inbox: cid => `tv:c:${cid}:inbox`,
  bot: cid => `tv:c:${cid}:bot`,
  links: cid => `tv:c:${cid}:links`,
  state: (cid, chat) => `tv:c:${cid}:st:${chat}`,
  done: (cid, test) => `tv:c:${cid}:done:${test}`,
  phone: ph => `tv:ph:${ph}`,
  tok: t => `tv:tok:${t}`
};

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
async function auth(token) {
  if (!token) return null;
  const v = await kv('GET', K.tok(token));
  return v ? JSON.parse(v) : null;
}
async function loadData(cid) {
  const s = await kv('GET', K.data(cid));
  return s ? unpack(s) : null;
}

/* Telegram Bot API */
async function tg(token, method, params, file) {
  let body, headers = {};
  if (file) {
    body = new FormData();
    for (const [k, v] of Object.entries(params || {})) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    body.append(file.field, new Blob([file.buf], { type: file.type }), file.name);
  } else { body = JSON.stringify(params || {}); headers['Content-Type'] = 'application/json'; }
  if (process.env.TV_TG_MOCK) return globalThis.__tgMock(method, params, file);
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers, body });
  return r.json();
}

module.exports = { kv, enabled, pack, unpack, rid, K, readBody, send, auth, loadData, tg };
