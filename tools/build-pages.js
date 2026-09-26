/* ============================================================
   DỰNG TRANG TĨNH cho duyet.com.vn

   Chạy: node tools/build-pages.js

   Đọc index.html (bản chú đưa lên) + tools/entity.json, rồi sinh:
     bai/<mã>/index.html     mỗi bài một trang thật, đọc được không cần JavaScript
     mat/<số>/index.html     trang mục của từng mặt
     bai/index.html          mục lục đủ các bài
     so-tay/index.html       sổ tay hiện trường, gom từ ghi chép thật trong bài
     doan-quoc-duyet/        trang giới thiệu — trang định danh cho tên
     assets/site.css         kiểu dáng lấy nguyên từ index.html
     sitemap.xml, llms.txt
   và chỉnh index.html (chỉ thêm, không xoá chữ của chú):
     gắn nghe.js + site.js, thẻ ảnh chia sẻ, JSON-LD định danh,
     một bản mục lục cho máy đọc không chạy JavaScript.

   Chạy lại bao nhiêu lần cũng ra y như nhau.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const E = JSON.parse(fs.readFileSync(path.join(__dirname, 'entity.json'), 'utf8'));
const SITE = E.site.replace(/\/+$/, '');
const TODAY = (process.env.BUILD_DATE || new Date().toISOString()).slice(0, 10);

/* ---------- đọc và sửa chữ index.html ---------- */
const INDEX_PATH = path.join(ROOT, 'index.html');
let src = fs.readFileSync(INDEX_PATH, 'utf8');
(E.suaChu || []).forEach(r => { if (r.tu && r.thanh) src = src.split(r.tu).join(r.thanh); });

const iD = src.indexOf('const DATA='), iS = src.indexOf('const SITU=');
if (iD < 0 || iS < 0) { console.error('Không tìm thấy DATA/SITU trong index.html'); process.exit(1); }
const { DATA } = new Function(src.slice(iD, iS) + ';return {DATA};')();

/* ---------- tiện ích ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
/* phải giống hệt slug() trong nghe.js và tools/extract.js */
function slug(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function clip(s, n) {
  s = plain(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, '') + '…';
}
const hash = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);
function out(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (old !== content) fs.writeFileSync(p, content, 'utf8');
  return old !== content;
}
const url = p => SITE + p;
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/* ---------- lấy lại chữ chú đã viết trong index.html ---------- */
function section(id) {
  const i = src.indexOf(`<section id="${id}"`);
  if (i < 0) return '';
  const j = src.indexOf('</section>', i);
  return j < 0 ? '' : src.slice(i, j);
}
const secDecision = section('decision');
const decisionBody = (() => {
  const a = secDecision.indexOf('<h2 class="about-hero"');
  const b = secDecision.indexOf('<div class="about-close">');
  return a >= 0 && b > a ? secDecision.slice(a, b).trim() : '';
})();
const inviteLine = (() => {
  const m = section('home').match(/<p class="invite-line">([\s\S]*?)<\/p>/);
  return m ? m[1].trim() : 'Mỗi deal đều có cái phải coi riêng. Giá rao, giấy tờ, bản đồ, quy hoạch — mỗi thứ cho mình một phần, và có những thứ phải xuống tận nơi mới thấy.';
})();
const notesIntro = (() => {
  const m = section('notes').match(/<p class="wn-intro">([\s\S]*?)<\/p>/);
  return m ? m[1].trim() : 'Ghi chép đi thực địa: có chỗ, có ngày, có cái thấy tận mắt.';
})();
const cssMain = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

/* ---------- tiếng đọc ---------- */
let manifest = { bai: {} };
try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio', 'manifest.json'), 'utf8')); } catch (e) {}

/* ---------- gom bài ---------- */
const bais = [];
const seen = new Map();
DATA.mucs.forEach((m, mi) => m.tangs.forEach((t, ti) => t.os.forEach((o, oi) => o.bais.forEach((b, bi) => {
  if (b.state !== 'ready' || !b.body) return;
  let id = slug(b.t) || 'bai';
  if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); id = id + '-' + n; } else seen.set(id, 1);
  const lead = (b.body.find(s => s.type === 'lead') || b.body.find(s => s.x) || {}).x || '';
  const text = b.body.map(s => s.type === 'field_log' ? (s.field_log ? s.field_log.body : '') : (s.type === 'dk' ? '' : (s.x || ''))).filter(Boolean).join('\n');
  bais.push({ m, mi, t, ti, o, oi, b, bi, id, path: `/bai/${id}/`, lead, desc: clip(lead, 158), words: plain(text).split(' ').filter(Boolean).length });
}))));
const byO = new Map();
bais.forEach(x => { const k = x.mi + '-' + x.ti + '-' + x.oi; if (!byO.has(k)) byO.set(k, []); byO.get(k).push(x); });
const matPath = m => `/mat/${m.id}/`;
const oAnchor = (ti, oi) => `o-${ti + 1}-${oi + 1}`;

/* ---------- dựng thân bài y như index.html ---------- */
function segLines(txt, firstOpen) {
  const lines = String(txt).split('\n').map(l => l.trim()).filter(Boolean);
  let o = '', first = true;
  lines.forEach(l => {
    if (l.indexOf('- ') === 0) o += '<p class="r-step">' + esc(l.slice(2)) + '</p>';
    else if (l.indexOf('>> ') === 0) o += '<p class="r-chot">' + esc(l.slice(3)) + '</p>';
    else o += '<p>' + (first && firstOpen ? firstOpen : '') + esc(l) + '</p>';
    first = false;
  });
  return o;
}
function renderBody(b) {
  return b.body.map(seg => {
    if (seg.type === 'lead') return `<p class="lead">${esc(seg.x)}</p>`;
    if (seg.type === 'drop') return `<p class="drop">${esc(seg.x)}</p>`;
    if (seg.type === 'dk') return '';
    if (seg.type === 'field_log') {
      if (!seg.field_log) return '';
      const fl = seg.field_log;
      const meta = [fl.place, fl.date].filter(v => v && v !== '—').join(' · ');
      const paras = (fl.body || '').split('\n').filter(s => s.trim()).map(s => `<p>${esc(s.trim())}</p>`).join('');
      return `<div class="flog">${meta ? `<div class="fl-meta">${esc(meta)}</div>` : ''}<div class="fl-body">${paras}</div></div>`;
    }
    if (seg.type === 'iam') return `<div class="iam">${segLines(seg.x, '<span class="iam-open">Nếu là tui — </span>')}</div>`;
    if (seg.type === 'rule') return '<div class="rrule"></div>';
    return segLines(seg.x, '');
  }).join('\n');
}

/* ---------- định danh (JSON-LD) ---------- */
const PERSON_ID = url('/#nguoi');
const WEB_ID = url('/#web');
const ABOUT = '/doan-quoc-duyet/';
const press = (E.baoChi || []).slice().sort((a, b) => b.ngay.localeCompare(a.ngay));
/* các vai trò; id/nguoi khớp JSON-LD trên site của từng công ty để Google gộp làm một người */
const CTs = (Array.isArray(E.congTy) ? E.congTy : []).filter(c => c.ten);
const vaiTro = E.vaiTroNgan || '';
/* câu mô tả trang đầu: nói rõ là bất động sản, kèm chức danh — thiếu hai thứ này Google đoán sai chủ trang */
const moTaChu = vaiTro ? `${E.ten} — ${vaiTro}. ${E.tenWeb}.` : E.moTa;
const orgOf = c => Object.assign({ '@type': 'Organization' },
  c.id ? { '@id': c.id.startsWith('#') ? url('/' + c.id) : c.id } : {},
  { name: c.ten }, (an => an.length ? { alternateName: an.length > 1 ? an : an[0] } : {})([c.tenNgan].concat(c.tenKhac || []).filter(x => x && x !== c.ten)), c.url ? { url: c.url } : {},
  c.moTa ? { description: c.moTa } : {}, c.sangLap ? { founder: { '@id': PERSON_ID } } : {});
function personFull() {
  const p = {
    '@type': 'Person', '@id': PERSON_ID,
    name: E.ten, alternateName: E.tenKhac,
    url: url(ABOUT), mainEntityOfPage: url(ABOUT),
    image: E.anh ? { '@type': 'ImageObject', url: url(E.anh), caption: E.anhMoTa || E.ten } : url('/og.png'),
    description: moTaChu,
    disambiguatingDescription: E.phanBiet,
    sameAs: E.sameAs.concat(CTs.map(c => c.nguoi).filter(Boolean)),
    knowsAbout: E.linhVuc,
    workLocation: (E.khuVuc || []).map(n => ({ '@type': 'Place', name: n })),
    email: 'mailto:' + E.lienHe.email,
    telephone: E.lienHe.dienThoaiQuocTe,
    contactPoint: { '@type': 'ContactPoint', telephone: E.lienHe.dienThoaiQuocTe, email: E.lienHe.email, contactType: 'business', availableLanguage: 'Vietnamese' },
    subjectOf: press.map(x => ({ '@type': 'NewsArticle', headline: x.tua, url: x.url, datePublished: x.ngay, publisher: { '@type': 'Organization', name: x.bao } })),
  };
  if (CTs.length) {
    p.jobTitle = CTs.map(c => c.dong);
    p.worksFor = CTs.map(orgOf);
  }
  return p;
}
const personRef = { '@type': 'Person', '@id': PERSON_ID, name: E.ten, url: url(ABOUT) };
const website = { '@type': 'WebSite', '@id': WEB_ID, url: url('/'), name: `${E.ten} — ${E.tenWeb}`, alternateName: E.tenWeb, description: moTaChu, inLanguage: 'vi', publisher: { '@id': PERSON_ID } };
const crumbs = list => ({ '@type': 'BreadcrumbList', itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: url(c[1]) })) });

/* ---------- khung trang tĩnh ---------- */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23C9A96E'/%3E%3C/svg%3E";
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=Be+Vietnam+Pro:wght@300;400;500&display=swap';
const ICON_MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-linecap="round"/>';

function page(o) {
  const title = o.title;
  const canonical = url(o.path);
  const graph = { '@context': 'https://schema.org', '@graph': [website].concat(o.ld || []) };
  return `<!DOCTYPE html>
<html lang="vi" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="author" content="${esc(E.ten)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#16140F">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${esc(E.ten + ' — ' + E.tenWeb)}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(o.ogTitle || title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${url('/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(E.tenWeb + ' — ' + E.ten)}">
<meta property="og:locale" content="vi_VN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${url('/og.png')}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
${ld(graph)}
</head>
<body${o.bodyAttr || ''}>
<a class="skip" href="#noi-dung">Bỏ qua, tới nội dung</a>
<header class="top">
  <a class="brand" href="/"><span class="orb"></span><span class="brand-name">${esc(E.ten)}</span></a>
  <button class="toggle" type="button" aria-label="Đổi nền sáng tối" onclick="var h=document.documentElement,n=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',n);try{localStorage.setItem('duyet-nen',n)}catch(e){}"><svg viewBox="0 0 24 24">${ICON_MOON}</svg></button>
</header>
<script>try{var n=localStorage.getItem('duyet-nen');if(n)document.documentElement.setAttribute('data-theme',n)}catch(e){}</script>
<main id="noi-dung" class="wrap${o.narrow ? ' wrap-read' : ''}">
${o.body}
</main>
<footer class="foot">
  <nav class="foot-nav" aria-label="Đi tiếp">
    <a href="/">Trang đầu</a><span>·</span><a href="/bai/">Mục lục</a><span>·</span><a href="/so-tay/">Sổ tay hiện trường</a>
  </nav>
  <div class="foot-kw">${esc(E.ten)}</div>
</footer>
${o.scripts || ''}
</body>
</html>
`;
}

function crumbHtml(list) {
  return `<nav class="crumb" aria-label="Đang ở đâu">${list.map((c, i) =>
    i < list.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a><span class="sep">/</span>` : `<span class="here">${esc(c[0])}</span>`).join('')}</nav>`;
}

const contactHtml = `<div class="invite-ways">
      <a href="tel:${E.lienHe.dienThoai}">${E.lienHe.dienThoai.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}</a>
      <span class="invite-sep">·</span>
      <a href="${E.lienHe.zalo}" target="_blank" rel="noopener">Zalo</a>
      <span class="invite-sep">·</span>
      <a href="mailto:${E.lienHe.email}">${E.lienHe.email}</a>
    </div>`;

const ctaHtml = `<aside class="cta" aria-label="Liên hệ">
    <p class="invite-line">${inviteLine}</p>
    <p class="invite-more"><a href="/#cach-toi-ra-quyet-dinh">Cách tôi ra quyết định →</a></p>
    <p class="invite-line invite-plain">Phần lớn thời gian của tôi ở ngoài hiện trường.</p>
    ${contactHtml}
  </aside>`;

/* ---------- 1. từng bài ---------- */
const written = [];
bais.forEach(x => {
  const { m, t, o, b } = x;
  const sibs = byO.get(x.mi + '-' + x.ti + '-' + x.oi);
  const pos = sibs.indexOf(x);
  const prev = sibs[pos - 1], next = sibs[pos + 1];
  const aud = manifest.bai && manifest.bai[x.id];
  const trail = [['Trang đầu', '/'], [m.title, matPath(m)], [o.name, matPath(m) + '#' + oAnchor(x.ti, x.oi)], [b.t, x.path]];
  const article = {
    '@type': 'Article', '@id': url(x.path) + '#bai',
    headline: clip(b.t, 110), description: x.desc, url: url(x.path), mainEntityOfPage: url(x.path),
    inLanguage: 'vi', author: personRef, publisher: { '@id': PERSON_ID }, isPartOf: { '@id': WEB_ID },
    image: url('/og.png'), articleSection: m.title, about: [m.title, t.name, o.name], wordCount: x.words,
  };
  if (aud) article.audio = { '@type': 'AudioObject', contentUrl: url('/audio/' + aud.f), encodingFormat: 'audio/mpeg', inLanguage: 'vi' };

  const body = `${crumbHtml(trail.slice(0, 3).concat([['đọc', '']]))}
  <article>
    <div class="kicker">${esc(m.title)} · ${esc(t.name)} · ${esc(o.name)}</div>
    <h1 class="rtitle" id="readTitle">${esc(b.t)}</h1>
    <p class="byline">Ghi chép của ${esc(E.ten)}</p>
    <div id="listenMount"></div>
    <div class="rbody" id="readBody">
${renderBody(b)}
    </div>
  </article>
  <nav class="rnav" aria-label="Bài trước, bài sau">
    ${prev ? `<a href="${prev.path}"><span class="rnav-dir">← Bài trước</span>${esc(prev.b.t)}</a>` : '<span></span>'}
    ${next ? `<a class="rnav-r" href="${next.path}"><span class="rnav-dir">Bài sau →</span>${esc(next.b.t)}</a>` : '<span></span>'}
  </nav>
  <p class="more"><a href="${matPath(m)}">Các bài khác trong mặt “${esc(m.title)}” →</a></p>
  ${ctaHtml}`;

  if (out(`bai/${x.id}/index.html`, page({
    path: x.path, title: `${b.t} — ${E.ten}`, ogTitle: b.t, desc: x.desc, ogType: 'article', narrow: true,
    bodyAttr: ` data-bai="${x.id}"`, body,
    ld: [{ '@type': 'Person', '@id': PERSON_ID, name: E.ten, url: url(ABOUT), sameAs: E.sameAs }, article, crumbs(trail)],
    scripts: '<script src="/nghe.js" defer></script>',
  }))) written.push(x.path);
});

/* ---------- 2. trang mục từng mặt ---------- */
DATA.mucs.forEach((m, mi) => {
  const inM = bais.filter(x => x.mi === mi);
  if (!inM.length) return;
  let idx = 0;
  const tangs = m.tangs.map((t, ti) => {
    const os = t.os.map((o, oi) => {
      const list = byO.get(mi + '-' + ti + '-' + oi);
      if (!list || !list.length) return '';
      return `<section class="hub-o" id="${oAnchor(ti, oi)}">
        <h3 class="ht-o">${esc(o.name)}</h3>
        <ul class="ht-list">${list.map(x => `<li><a href="${x.path}"><span class="ht-idx">${String(++idx).padStart(2, '0')}</span><span>${esc(x.b.t)}</span></a></li>`).join('')}</ul>
      </section>`;
    }).join('');
    if (!os) return '';
    return `<section class="tang"><div class="tang-head"><span class="tang-roman">${esc(t.roman)}</span><h2 class="tang-name">${esc(t.name)}</h2></div>
      ${t.gloss ? `<p class="tang-gloss">${esc(t.gloss)}</p>` : ''}${os}</section>`;
  }).join('');
  const desc = clip(m.desc || `${inM.length} bài của ${E.ten} trong mặt ${m.title}.`, 158);
  const body = `${crumbHtml([['Trang đầu', '/'], [m.title, '']])}
  ${m.eyebrow ? `<div class="mt-eyebrow">${esc(m.eyebrow)}</div>` : ''}
  <h1 class="mt-title">${esc(m.title)}</h1>
  ${m.desc ? `<p class="mt-desc">${esc(m.desc)}</p>` : ''}
  <p class="count">${inM.length} bài</p>
  ${tangs}
  ${ctaHtml}`;
  if (out(`mat/${m.id}/index.html`, page({
    path: matPath(m), title: `${m.title} — ${E.ten}`, ogTitle: m.title, desc, body,
    ld: [{ '@type': 'CollectionPage', '@id': url(matPath(m)), name: m.title, description: desc, url: url(matPath(m)), inLanguage: 'vi', isPartOf: { '@id': WEB_ID }, author: personRef,
      mainEntity: { '@type': 'ItemList', numberOfItems: inM.length, itemListElement: inM.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: url(x.path), name: x.b.t })) } },
      crumbs([['Trang đầu', '/'], [m.title, matPath(m)]])],
  }))) written.push(matPath(m));
});

/* ---------- 3. mục lục ---------- */
{
  const blocks = DATA.mucs.map((m, mi) => {
    const inM = bais.filter(x => x.mi === mi);
    if (!inM.length) return '';
    return `<section class="toc-m">
      <h2 class="toc-h"><a href="${matPath(m)}"><span class="face-num">${esc(m.num)}</span> ${esc(m.title)}</a> <span class="face-side">${esc(m.side || '')}</span></h2>
      <ul class="ht-list">${inM.map(x => `<li><a href="${x.path}"><span>${esc(x.b.t)}</span></a></li>`).join('')}</ul>
    </section>`;
  }).join('');
  const desc = `Mục lục ${bais.length} bài của ${E.ten}: đọc đất bằng chân, dòng tiền, chu kỳ thị trường, hồ sơ từng vùng như Nam Ban, Cần Giờ.`;
  if (out('bai/index.html', page({
    path: '/bai/', title: `Mục lục — ${E.ten}`, ogTitle: 'Mục lục', desc: clip(desc, 158),
    body: `${crumbHtml([['Trang đầu', '/'], ['Mục lục', '']])}
  <h1 class="mt-title">Tất cả bài viết</h1>
  <p class="mt-desc">${bais.length} bài, chia theo ${DATA.mucs.filter((m, mi) => bais.some(x => x.mi === mi)).length} mặt. Mỗi bài có bản nghe.</p>
  ${blocks}`,
    ld: [{ '@type': 'CollectionPage', '@id': url('/bai/'), name: 'Mục lục', url: url('/bai/'), inLanguage: 'vi', isPartOf: { '@id': WEB_ID }, author: personRef,
      mainEntity: { '@type': 'ItemList', numberOfItems: bais.length, itemListElement: bais.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: url(x.path), name: x.b.t })) } },
      crumbs([['Trang đầu', '/'], ['Mục lục', '/bai/']])],
  }))) written.push('/bai/');
}

/* ---------- 4. sổ tay hiện trường — gom ghi chép thật trong các bài ---------- */
{
  const logs = [];
  bais.forEach(x => x.b.body.forEach(seg => {
    if (seg.type !== 'field_log' || !seg.field_log || !(seg.field_log.body || '').trim()) return;
    logs.push({ x, fl: seg.field_log });
  }));
  const items = logs.map(({ x, fl }) => {
    const meta = [fl.place, fl.date].filter(v => v && v !== '—').join(' · ');
    const paras = (fl.body || '').split('\n').filter(s => s.trim()).map(s => `<p>${esc(s.trim())}</p>`).join('');
    return `<article class="flog">
      ${meta ? `<div class="fl-meta">${esc(meta)}</div>` : ''}
      <div class="fl-body">${paras}</div>
      <p class="fl-src"><a href="${x.path}">Trong bài: ${esc(x.b.t)} →</a></p>
    </article>`;
  }).join('');
  const desc = `${logs.length} ghi chép thực địa của ${E.ten} — có chỗ, có cái thấy tận mắt, ở Nam Ban, Cần Giờ và các vùng khác.`;
  if (out('so-tay/index.html', page({
    path: '/so-tay/', title: `Sổ tay hiện trường — ${E.ten}`, ogTitle: 'Sổ tay hiện trường', desc: clip(desc, 158), narrow: true,
    body: `${crumbHtml([['Trang đầu', '/'], ['Sổ tay hiện trường', '']])}
  <div class="mt-eyebrow">Không phải trang giới thiệu</div>
  <h1 class="mt-title">Sổ tay hiện trường</h1>
  <p class="wn-intro">${notesIntro}</p>
  ${items || '<p class="pending-note">Ghi chép đang được gom lại từ những chuyến đi.</p>'}
  ${ctaHtml}`,
    ld: [{ '@type': 'CollectionPage', '@id': url('/so-tay/'), name: 'Sổ tay hiện trường', description: desc, url: url('/so-tay/'), inLanguage: 'vi', isPartOf: { '@id': WEB_ID }, author: personRef },
      crumbs([['Trang đầu', '/'], ['Sổ tay hiện trường', '/so-tay/']])],
  }))) written.push('/so-tay/');
}

/* ---------- 5. trang giới thiệu — trang định danh ---------- */
{
  /* dòng chữ lấy nguyên từ entity.json, không thêm bớt; chỉ viết hoa chữ đầu dòng */
  const row = c => `<span class="press-t">${esc(c.dong.charAt(0).toUpperCase() + c.dong.slice(1))}</span>${c.url ? `<span class="press-meta">${esc(c.url.replace(/^https?:\/\//, ''))}</span>` : ''}`;
  const company = CTs.length ? `<section class="about-sec" id="cong-viec">
      <div class="about-sec-q">Công việc</div>
      <ul class="press">${CTs.map(c => `<li>${c.url ? `<a href="${esc(c.url)}" rel="noopener" target="_blank">${row(c)}</a>` : `<div class="press-row">${row(c)}</div>`}</li>`).join('')}</ul>
    </section>` : '';
  const pressHtml = press.length ? `<section class="about-sec" id="bao-chi">
      <div class="about-sec-q">Báo chí trích dẫn</div>
      <p>Mấy lần báo chí hỏi tôi về thị trường, từ ${press[press.length - 1].ngay.slice(0, 4)} tới nay.</p>
      <ul class="press">${press.map(x => `<li><a href="${esc(x.url)}" rel="noopener" target="_blank"><span class="press-t">${esc(x.tua)}</span><span class="press-meta">${esc(x.bao)} · ${x.ngay.split('-').reverse().join('/')}</span></a></li>`).join('')}</ul>
    </section>` : '';
  const desc = clip(`${E.ten} — ${vaiTro ? vaiTro + '. ' : ''}${E.phanBiet}`, 158);
  const body = `${crumbHtml([['Trang đầu', '/'], [E.ten, '']])}
  ${E.anh ? `<img class="mt-photo" src="${esc(E.anh)}" width="440" height="440" alt="${esc(E.anhMoTa || E.ten)}">` : ''}
  <h1 class="mt-title">${esc(E.ten)}</h1>
  ${vaiTro ? `<p class="mt-role">${esc(vaiTro)}</p>` : ''}
  <p class="mt-desc">${esc(E.moTa)}</p>
  ${decisionBody}
  ${company}
  ${pressHtml}
  <section class="about-sec">
    <div class="about-sec-q">Đọc tiếp</div>
    <ul class="ht-list">
      <li><a href="/bai/"><span>Mục lục đủ ${bais.length} bài</span></a></li>
      <li><a href="/so-tay/"><span>Sổ tay hiện trường</span></a></li>
      ${DATA.mucs.filter((m, mi) => bais.some(x => x.mi === mi)).map(m => `<li><a href="${matPath(m)}"><span>${esc(m.title)}</span></a></li>`).join('')}
    </ul>
  </section>
  <div class="about-close">
    <p>Phần lớn thời gian của tôi ở ngoài hiện trường.</p>
    <p class="about-role">${esc(E.ten)}</p>
    ${contactHtml.replace('invite-ways', 'about-ways')}
  </div>`;
  if (out('doan-quoc-duyet/index.html', page({
    path: ABOUT, title: vaiTro ? `${E.ten} — ${vaiTro}` : `Về ${E.ten} — cách tôi ra quyết định`, ogTitle: E.ten, desc, ogType: 'profile', body,
    ld: [{ '@type': 'ProfilePage', '@id': url(ABOUT), url: url(ABOUT), name: E.ten, inLanguage: 'vi', isPartOf: { '@id': WEB_ID }, mainEntity: personFull() },
      crumbs([['Trang đầu', '/'], [E.ten, ABOUT]])],
  }))) written.push(ABOUT);
}

/* ---------- 6. kiểu dáng ---------- */
const cssStatic = `
/* ===== thêm cho trang tĩnh (tools/build-pages.js) ===== */
.skip{position:absolute;left:-999px;top:0;background:var(--gold);color:var(--ink);padding:.6rem 1rem;z-index:200}
.skip:focus{left:.5rem;top:.5rem}
a.brand{text-decoration:none}
.toggle svg{width:14px;height:14px;stroke:var(--text-2);fill:none;stroke-width:1.5}
.crumb a{color:var(--text-2);text-decoration:none;font-size:.8rem;display:inline-flex;align-items:center;min-height:44px;transition:color .3s}
.crumb a:hover{color:var(--gold)}
.byline{font-size:.82rem;color:var(--text-2);margin:-1.2rem 0 1.6rem;letter-spacing:.02em}
.byline a{color:var(--text-1);text-decoration:none;border-bottom:1px solid var(--gold-line)}
.byline a:hover{color:var(--gold)}
#listenMount:empty{display:none}
.rnav a{display:block;text-decoration:none;color:var(--text-2);font-size:.82rem;max-width:45%;min-height:44px;transition:color .3s}
.rnav a:hover{color:var(--gold)}
.rnav a.rnav-r{text-align:right;margin-left:auto}
.more{margin:2rem 0 0;font-size:.88rem}
.more a,.invite-more a,.fl-src a{color:var(--text-1);text-decoration:none;border-bottom:1px solid var(--gold-line);transition:color .3s,border-color .3s}
.more a:hover,.invite-more a:hover,.fl-src a:hover{color:var(--gold);border-color:var(--gold)}
.cta{margin-top:3.2rem;padding-top:2rem;border-top:1px solid var(--gold-line)}
.invite-more a{display:inline-flex;align-items:center;min-height:44px}
.count{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text-2);margin:-1.4rem 0 1.6rem}
.tang-name{margin:0;font-weight:400}
.hub-o{scroll-margin-top:5rem}
.ht-o{font-family:var(--serif);font-weight:400;font-size:1.02rem;color:var(--text-1);margin:1.2rem 0 .3rem 2.65rem}
.ht-list{list-style:none;margin:0 0 .6rem;padding:0}
.hub-o .ht-list{margin-left:2.65rem}
.ht-list li{border-bottom:1px solid var(--gold-ghost)}
.ht-list a{display:flex;gap:.7rem;align-items:baseline;padding:.75rem .4rem;min-height:44px;text-decoration:none;color:var(--text-0);font-size:.98rem;line-height:1.45;transition:padding-left .3s var(--ease),color .3s}
.ht-list a:hover{padding-left:.9rem;color:var(--gold)}
.ht-idx{font-family:var(--serif);font-size:.8rem;color:var(--gold-dim);min-width:1.6rem}
.toc-m{margin:2.4rem 0 0}
.toc-h{font-family:var(--serif);font-weight:400;font-size:clamp(1.15rem,3vw,1.45rem);margin:0 0 .6rem;padding-bottom:.6rem;border-bottom:1px solid var(--gold-line)}
.toc-h a{color:var(--text-0);text-decoration:none}
.toc-h a:hover{color:var(--gold)}
.toc-h .face-num{font-size:.86rem;color:var(--gold);margin-right:.4rem}
.fl-src{margin:.8rem 0 0;font-size:.85rem}
main .flog{margin:1.6rem 0}
.press{list-style:none;margin:.6rem 0 0;padding:0}
.press li{border-bottom:1px solid var(--gold-ghost)}
.press a{display:block;padding:.8rem .2rem;min-height:44px;text-decoration:none;transition:padding-left .3s var(--ease)}
.press a:hover{padding-left:.7rem}
.press-t{display:block;font-family:var(--serif);font-size:1.02rem;color:var(--text-0);line-height:1.4}
.press a:hover .press-t{color:var(--gold)}
.mt-role{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-dim);margin:-.4rem 0 1rem;line-height:1.6}
.mt-photo{display:block;width:112px;height:112px;border-radius:50%;object-fit:cover;margin:0 0 1.4rem;border:1px solid var(--gold-ghost)}
.press-row{padding:.8rem .2rem;min-height:44px}
.press-meta{display:block;font-size:.76rem;letter-spacing:.06em;color:var(--text-2);margin-top:.25rem}
.foot-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem .6rem;margin-bottom:1rem;font-size:.82rem}
.foot-nav a{color:var(--text-2);text-decoration:none;display:inline-flex;align-items:center;min-height:44px;transition:color .3s}
.foot-nav a:hover{color:var(--gold)}
.foot-nav span{color:var(--gold-dim);display:inline-flex;align-items:center}
/* các sửa nhỏ nghe.js vẫn gắn trong index.html, trang tĩnh gắn sẵn ở đây */
.invite-ways a,.about-ways a{display:inline-block;min-height:44px;line-height:44px;padding:0 .2rem}
.foot-kw{font-size:.75rem}
.face-side{color:var(--text-1)}
html[data-theme="light"]{--gold-dim:#7A6230}
a:focus-visible,button:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:3px}
`;
const cssChanged = out('assets/site.css', '/* Lấy nguyên từ <style> trong index.html — tools/build-pages.js tự dựng lại, đừng sửa tay */\n' + cssMain + cssStatic);

/* ---------- 7. sitemap (lastmod chỉ đổi khi trang thật sự đổi) ---------- */
const STATE_PATH = path.join(__dirname, 'sitemap-state.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) {}
const urls = ['/', ABOUT, '/bai/', '/so-tay/']
  .concat(DATA.mucs.filter((m, mi) => bais.some(x => x.mi === mi)).map(matPath))
  .concat(bais.map(x => x.path));
const fileFor = p => p === '/' ? 'index.html' : p.replace(/^\//, '') + 'index.html';
const newState = {};
urls.forEach(p => {
  const f = path.join(ROOT, fileFor(p));
  const h = fs.existsSync(f) ? hash(fs.readFileSync(f, 'utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')) : '';
  const prev = state[p];
  newState[p] = { h, lastmod: prev && prev.h === h ? prev.lastmod : TODAY };
});

/* ---------- 8. chỉnh index.html — chỉ thêm, không xoá chữ ---------- */
let html = src;
const mark = (name, body) => `<!-- dung:${name} -->${body}<!-- /dung:${name} -->`;
/* chèn một khối có đánh dấu; lần sau chạy thì thay đúng khối đó, không chèn thêm */
const putMarked = (name, body, where) => {
  const re = new RegExp(`<!-- dung:${name} -->[\\s\\S]*?<!-- /dung:${name} -->`);
  const block = mark(name, body);
  html = re.test(html) ? html.replace(re, () => block) : where(html, block);
};

/* JSON-LD: bỏ các khối cũ không có đánh dấu, gắn khối định danh mới */
html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>\s*/g, (m0, j, off) => {
  const inMarked = html.lastIndexOf('<!-- dung:dinh-danh -->', off) > html.lastIndexOf('<!-- /dung:dinh-danh -->', off);
  if (inMarked) return m0;
  /* bỏ Person/WebSite cũ; bỏ cả FAQPage — câu trả lời không hiện trên trang lúc tải nên Google coi là không khớp */
  return /"@type"\s*:\s*"(Person|WebSite|FAQPage)"/.test(j) ? '' : m0;
});
putMarked('dinh-danh', ld({ '@context': 'https://schema.org', '@graph': [website, personFull()] }),
  (h, block) => h.replace('</head>', () => block + '\n</head>'));

/* thẻ ảnh chia sẻ */
if (!/property="og:image"/.test(html)) {
  html = html.replace('</head>', `<meta property="og:image" content="${url('/og.png')}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n</head>`);
}
html = html.replace(/<meta name="twitter:card" content="summary">/, '<meta name="twitter:card" content="summary_large_image">');

/* tiêu đề trang đầu — dòng xanh Google hiện; site.js giữ nó làm tiêu đề màn đầu */
if (E.tieuDeTrangDau) {
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(E.tieuDeTrangDau)}</title>`)
    .replace(/(<meta (?:name|property)="(?:og:title|twitter:title)" content=")[^"]*(")/g, (m, a, b) => a + esc(E.tieuDeTrangDau) + b);
}
/* câu mô tả trang đầu (đoạn Google hiện dưới tiêu đề) */
html = html.replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*(")/g,
  (m, a, b) => a + esc(moTaChu) + b);

/* mục lục cho máy không chạy JavaScript (bot AI, trình đọc thô) */
const navNoJs = `<noscript><nav class="nojs-nav" aria-label="Mục lục" style="max-width:40rem;margin:0 auto;padding:6rem 1.4rem 2rem">
<p><a href="${ABOUT}">${esc(E.ten)}</a> — ${vaiTro ? esc(vaiTro) + '. ' : ''}${esc(E.phanBiet)}</p>
<p><a href="/bai/">Mục lục đủ ${bais.length} bài</a> · <a href="/so-tay/">Sổ tay hiện trường</a></p>
${DATA.mucs.map((m, mi) => { const l = bais.filter(x => x.mi === mi); return l.length ? `<h2><a href="${matPath(m)}">${esc(m.title)}</a></h2><ul>${l.map(x => `<li><a href="${x.path}">${esc(x.b.t)}</a></li>`).join('')}</ul>` : ''; }).join('\n')}
</nav></noscript>`;
putMarked('muc-luc', navNoJs, (h, block) => h.replace(/<body([^>]*)>/, m => m + '\n' + block));

/* nghe.js + site.js */
if (!/<script src="\/?nghe\.js"/.test(html)) html = html.replace('</body>', '<script src="nghe.js"></script>\n</body>');
if (!/<script src="\/?site\.js"/.test(html)) html = html.replace(/(<script src="\/?nghe\.js"[^>]*><\/script>)/, '$1\n<script src="site.js"></script>');

const indexChanged = html !== fs.readFileSync(INDEX_PATH, 'utf8');
if (indexChanged) fs.writeFileSync(INDEX_PATH, html, 'utf8');

/* hash của index sau khi chỉnh — cho lastmod trang đầu */
{
  const h = hash(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''));
  const prev = state['/'];
  newState['/'] = { h, lastmod: prev && prev.h === h ? prev.lastmod : TODAY };
}
out('tools/sitemap-state.json', JSON.stringify(newState, null, 1) + '\n');
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(p => `  <url><loc>${url(p)}</loc><lastmod>${newState[p].lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);

/* ---------- 9. llms.txt ---------- */
out('llms.txt', `# ${E.ten} — ${E.tenWeb}

> ${moTaChu}

${E.phanBiet}${vaiTro ? ` ${vaiTro}.` : ''} Liên hệ: ${E.lienHe.dienThoai} (điện thoại/Zalo), ${E.lienHe.email}.

## Về tác giả
- [${E.ten}](${url(ABOUT)}): giới thiệu, cách ra quyết định, báo chí trích dẫn
- [Sổ tay hiện trường](${url('/so-tay/')}): ghi chép thực địa, có chỗ, có cái thấy tận mắt
- [Mục lục](${url('/bai/')}): đủ ${bais.length} bài

${DATA.mucs.map((m, mi) => { const l = bais.filter(x => x.mi === mi); return l.length ? `## ${m.title}\n${l.map(x => `- [${plain(x.b.t)}](${url(x.path)}): ${x.desc}`).join('\n')}` : ''; }).filter(Boolean).join('\n\n')}

## Báo chí trích dẫn
${press.map(x => `- [${x.tua}](${x.url}) — ${x.bao}, ${x.ngay}`).join('\n')}
`);

/* ---------- 10. dọn trang của bài đã gỡ ---------- */
const keep = new Set(bais.map(x => x.id));
const baiDir = path.join(ROOT, 'bai');
let removed = 0;
if (fs.existsSync(baiDir)) fs.readdirSync(baiDir).forEach(d => {
  const p = path.join(baiDir, d);
  if (fs.statSync(p).isDirectory() && !keep.has(d)) { fs.rmSync(p, { recursive: true, force: true }); removed++; }
});

/* ---------- kiểm tra: mã bài phải khớp file tiếng ---------- */
let mismatch = 0;
try {
  const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio', 'texts.json'), 'utf8'));
  const ids = new Set(t.map(x => x.id));
  bais.forEach(x => { if (!ids.has(x.id)) mismatch++; });
} catch (e) {}

console.log(`${bais.length} bài · ${urls.length} địa chỉ trong sitemap · ${written.length} trang đổi · xoá ${removed} · index.html ${indexChanged ? 'đã chỉnh' : 'không đổi'} · css ${cssChanged ? 'đổi' : 'không đổi'}${mismatch ? ` · ${mismatch} bài chưa khớp mã tiếng (tiếng sẽ thu sau)` : ''}`);
