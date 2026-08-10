/* Rút chữ của từng bài trong index.html ra JSON cho bước thu tiếng.
   Chạy: node tools/extract.js
   Kết quả: audio/texts.json  */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---- lấy DATA ra khỏi file ---- */
const d = src.indexOf('const DATA=');
const su = src.indexOf('const SITU=');
if (d < 0 || su < 0) { console.error('Không tìm thấy DATA trong index.html'); process.exit(1); }
const { DATA } = new Function(src.slice(d, su) + '; return {DATA};')();

/* ---- mã bài: bỏ dấu, chữ thường, nối bằng gạch ----
   Phải giống hệt hàm slug() trong nghe.js. */
function slug(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* ---- chữ để đọc: đúng những gì hiện trên màn hình ---- */
function textOf(b) {
  const parts = [];
  (b.body || []).forEach(seg => {
    if (!seg) return;
    if (seg.type === 'dk') return;                       /* ghi chú nội bộ, không đọc */
    if (seg.type === 'field_log') {
      if (!seg.field_log) return;                        /* chưa có ghi chép thật */
      const fl = seg.field_log;
      const place = (fl.place && fl.place !== '—') ? fl.place : '';
      const date = (fl.date && fl.date !== '—') ? fl.date : '';
      const meta = [place, date].filter(Boolean).join(', ');
      if (meta) parts.push(meta + '.');
      if (fl.body) parts.push(fl.body);
      return;
    }
    if (seg.type === 'rule') return;
    if (seg.x) parts.push(seg.x);
  });
  return parts.join('\n').trim();
}

function hash(s) {
  return require('crypto').createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);
}

const items = [];
const seen = new Map();
DATA.mucs.forEach(m => m.tangs.forEach(t => t.os.forEach(o => o.bais.forEach(b => {
  if (b.state !== 'ready' || !b.body) return;
  const text = textOf(b);
  if (!text) return;
  let id = slug(b.t);
  if (!id) id = 'bai';
  if (seen.has(id)) {                                    /* trùng tựa thì thêm đuôi */
    const n = seen.get(id) + 1;
    seen.set(id, n);
    id = id + '-' + n;
  } else seen.set(id, 1);
  const full = b.t + '. ' + text;
  items.push({ id, title: b.t, hash: hash(full), chars: full.length, text: full });
}))));

fs.mkdirSync(path.join(ROOT, 'audio'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'audio', 'texts.json'), JSON.stringify(items, null, 1), 'utf8');

const chars = items.reduce((a, x) => a + x.chars, 0);
console.log(items.length + ' bài, ' + chars.toLocaleString('vi-VN') + ' ký tự (~' + Math.round(chars / 900) + ' phút)');
