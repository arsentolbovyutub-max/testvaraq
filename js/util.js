/* Barcha modullar uchun yordamchi funksiyalar. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'tst' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x)) return d;
  const p = n => String(n).padStart(2, '0');
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`;
}
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function round1(x) { return Math.round(x * 10) / 10; }

async function hashPass(p) {
  const s = 'tv-salt:' + p;
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    return 'f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
}

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 9) return '998' + d;
  return d;
}

/* Modal: {el, close} qaytaradi. */
function modal(html, onMount) {
  const root = $('#modal-root');
  const bg = document.createElement('div');
  bg.className = 'mb';
  bg.innerHTML = `<div class="md">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  root.appendChild(bg);
  $$('[data-close]', bg).forEach(b => b.addEventListener('click', close));
  if (onMount) onMount(bg, close);
  return { el: bg, close };
}

function confirmBox(text, okLabel = "O'chirish") {
  return new Promise(res => {
    modal(`<h2>Tasdiqlang</h2><p>${esc(text)}</p>
      <div class="btns"><button class="btn sp" data-close>Bekor qilish</button><button class="btn pri sp" id="cf-ok">${esc(okLabel)}</button></div>`,
      (el, close) => {
        $('#cf-ok', el).onclick = () => { close(); res(true); };
        el.addEventListener('click', e => { if (e.target === el || e.target.hasAttribute('data-close')) res(false); });
      });
  });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* Telefonning "ulashish" oynasi (Telegram va h.k.) yoki yuklab olish. */
async function shareOrDownload(blob, name, title) {
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || name });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(blob, name);
}

function loadImageFile(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      res(c);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

/* Kirill -> lotin (fayl nomlari va shrift yuklanmagan holat uchun). */
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:"'",ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:"o'",қ:'q',ғ:"g'",ҳ:'h' };
function latin(s) {
  return String(s ?? '').replace(/[Ѐ-ӿ]/g, ch => {
    const lo = ch.toLowerCase(); const t = CYR[lo];
    if (t === undefined) return ch;
    return ch === lo ? t : (t.charAt(0).toUpperCase() + t.slice(1));
  }).replace(/[ʻʼ‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
}
