/* ============================================================
   SITE.JS — làm cho trang một-màn-hình của duyet.com.vn cư xử
   như một trang web bình thường:

   1. Mở bài nào thì địa chỉ đổi theo bài đó (/bai/<mã>/), nên
      chép link gửi người khác là tới đúng bài, tải lại vẫn đúng bài.
   2. Nút Back của trình duyệt / điện thoại quay về màn trước,
      thay vì văng khỏi web như trước.
   3. Trang đầu có đường dẫn thật tới Mục lục và Sổ tay, để Google
      (và người đọc) đi được tới từng bài.
   4. Màn "Sổ tay hiện trường" hiện các ghi chép thực địa có thật
      trong các bài, thay vì để trống.

   Không sửa chữ nào của index.html. Tự nối vào các hàm có sẵn.
   index.html chỉ cần:  <script src="site.js"></script>  sau nghe.js
   ============================================================ */
(function () {
  'use strict';
  if (typeof window.go !== 'function' || typeof DATA === 'undefined') return;

  var NAME = 'Đoàn Quốc Duyệt';
  var TITLE0 = document.title;

  /* ---------- mã bài: giống hệt tools/build-pages.js ---------- */
  function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
  var idOf = {}, refOf = {}, seen = {};
  DATA.mucs.forEach(function (m, mi) { m.tangs.forEach(function (t, ti) { t.os.forEach(function (o, oi) { o.bais.forEach(function (b, bi) {
    if (b.state !== 'ready' || !b.body) return;
    var id = slug(b.t) || 'bai';
    if (seen[id]) { seen[id]++; id = id + '-' + seen[id]; } else seen[id] = 1;
    var k = mi + '-' + ti + '-' + oi + '-' + bi;
    idOf[k] = id; refOf[id] = [mi, ti, oi, bi];
  }); }); }); });

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- màn → địa chỉ ---------- */
  function urlFor(st) {
    var m;
    switch (st.k) {
      case 'home': return '/';
      case 'face': m = DATA.mucs[st.a[0]]; return m ? '/mat/' + m.id + '/' : '/';
      case 'o': m = DATA.mucs[st.a[0]]; return m ? '/mat/' + m.id + '/#o-' + (st.a[1] + 1) + '-' + (st.a[2] + 1) : '/';
      case 'series': m = DATA.mucs[4]; return m ? '/mat/' + m.id + '/' : '/';
      case 'bai': var id = idOf[st.a.join('-')]; return id ? '/bai/' + id + '/' : '/';
      case 'situ': return '/#tinh-huong-' + (st.a[0] + 1);
      case 'screen':
        if (st.a[0] === 'decision') return '/#cach-toi-ra-quyet-dinh';
        if (st.a[0] === 'notes') return '/so-tay/';
        if (st.a[0] === 'think') return '/#nguyen-tac';
        return '/';
    }
    return '/';
  }
  function titleFor(st) {
    try {
      if (st.k === 'bai') return DATA.mucs[st.a[0]].tangs[st.a[1]].os[st.a[2]].bais[st.a[3]].t + ' — ' + NAME;
      if (st.k === 'face' || st.k === 'o' || st.k === 'series') return DATA.mucs[st.k === 'series' ? 4 : st.a[0]].title + ' — ' + NAME;
      if (st.k === 'screen' && st.a[0] === 'decision') return 'Cách tôi ra quyết định — ' + NAME;
      if (st.k === 'screen' && st.a[0] === 'notes') return 'Sổ tay hiện trường — ' + NAME;
    } catch (e) {}
    return TITLE0;
  }

  /* ---------- nối vào các hàm có sẵn ---------- */
  var depth = 0, replaying = false, onGate = true;
  function record(st) {
    if (replaying) return;
    var u = urlFor(st);
    try {
      /* từ màn cổng bước vào: thay chứ không chồng, để Back không quay lại màn cổng */
      if (onGate) history.replaceState(st, '', u);
      else history.pushState(st, '', u);
    } catch (e) {}
    onGate = false;
    document.title = titleFor(st);
  }
  function wrap(name, toState) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var outer = depth === 0;
      depth++;
      var r;
      try { r = orig.apply(this, arguments); }
      finally { depth--; }
      if (outer) { var st = toState([].slice.call(arguments)); if (st) record(st); }
      return r;
    };
  }
  wrap('go', function (a) {
    var id = a[0];
    if (id === 'home') return { k: 'home', a: [] };
    if (id === 'decision' || id === 'notes' || id === 'think') return { k: 'screen', a: [id] };
    return null;   /* 'reader', 'face', 'situResult' do hàm khác gọi, đã ghi ở hàm đó */
  });
  wrap('openFace', function (a) { return { k: 'face', a: [a[0]] }; });
  wrap('openO', function (a) { return { k: 'o', a: [a[0], a[1], a[2]] }; });
  wrap('openBai', function (a) { return { k: 'bai', a: [a[0], a[1], a[2], a[3]] }; });
  wrap('openSitu', function (a) { return { k: 'situ', a: [a[0]] }; });
  wrap('openSeries', function () { return { k: 'series', a: [] }; });
  wrap('openBaiByRef', function () { return null; });   /* nó gọi openBai, openBai tự ghi */

  function replay(st) {
    replaying = true;
    try {
      if (!st) { window.go('home'); }
      else if (st.k === 'home') window.go('home');
      else if (st.k === 'face') window.openFace(st.a[0]);
      else if (st.k === 'o') { window.openFace(st.a[0]); window.openO(st.a[0], st.a[1], st.a[2]); }
      else if (st.k === 'bai') window.openBai(st.a[0], st.a[1], st.a[2], st.a[3]);
      else if (st.k === 'situ') window.openSitu(st.a[0]);
      else if (st.k === 'series') window.openSeries();
      else if (st.k === 'screen') window.go(st.a[0]);
      document.title = titleFor(st || { k: 'home' });
    } catch (e) { try { window.go('home'); } catch (e2) {} }
    replaying = false;
  }
  window.addEventListener('popstate', function (ev) {
    onGate = false;
    replay(ev.state);
  });

  /* ---------- mở thẳng từ địa chỉ có dấu # ---------- */
  (function () {
    var h = location.hash || '';
    var m = h.match(/^#tinh-huong-(\d+)$/);
    var st = null;
    if (m) st = { k: 'situ', a: [+m[1] - 1] };
    else if (h === '#nguyen-tac') st = { k: 'screen', a: ['think'] };
    else if (h === '#cach-toi-ra-quyet-dinh') st = { k: 'screen', a: ['decision'] };
    if (!st) return;
    replay(st);
    try { history.replaceState(st, '', urlFor(st)); } catch (e) {}
    onGate = false;
  })();

  /* ---------- kiểu dáng cho phần thêm ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.home-links{display:flex;flex-wrap:wrap;gap:.4rem 1.4rem;margin:-2.4rem 0 3.6rem;font-size:.86rem}',
    '.home-links a{color:var(--text-1);text-decoration:none;border-bottom:1px solid var(--gold-line);display:inline-flex;align-items:center;min-height:44px;transition:color .3s,border-color .3s}',
    '.home-links a:hover{color:var(--gold);border-color:var(--gold)}',
    '.fl-src{margin:.8rem 0 0;font-size:.85rem}',
    '.fl-src button{background:none;border:none;border-bottom:1px solid var(--gold-line);padding:0;min-height:44px;font-family:var(--sans);font-size:.85rem;color:var(--text-1);cursor:pointer;text-align:left;transition:color .3s,border-color .3s}',
    '.fl-src button:hover{color:var(--gold);border-color:var(--gold)}',
    '#notesBody .flog{margin:1.6rem 0}',
    '.foot-kw a.chu-ky{color:inherit;text-decoration:none;display:inline-block;padding:.9rem .4rem;border-bottom:1px solid transparent;transition:color .8s,border-color .8s}',
    '.foot-kw a.chu-ky:hover,.foot-kw a.chu-ky:focus-visible{color:var(--gold);border-color:var(--gold-line)}'
  ].join('');
  document.head.appendChild(css);

  /* ---------- trang đầu: đường dẫn thật tới mục lục, sổ tay ---------- */
  (function () {
    var faces = document.querySelector('#home .faces');
    if (!faces || document.querySelector('#home .home-links')) return;
    var n = Object.keys(refOf).length;
    var p = document.createElement('nav');
    p.className = 'home-links';
    p.setAttribute('aria-label', 'Đọc theo cách khác');
    p.innerHTML = '<a href="/bai/">Mục lục đủ ' + n + ' bài →</a><a href="/so-tay/">Sổ tay hiện trường →</a>';
    faces.parentNode.insertBefore(p, faces.nextSibling);
  })();

  /* ---------- cửa duy nhất vào trang /doan-quoc-duyet/: chữ ký cuối trang đầu ---------- */
  (function () {
    var kw = document.querySelector('#home .foot-kw');
    if (!kw || kw.querySelector('a')) return;
    var a = document.createElement('a');
    a.className = 'chu-ky';
    a.href = '/doan-quoc-duyet/';
    a.textContent = kw.textContent;
    kw.textContent = '';
    kw.appendChild(a);
  })();

  /* ---------- sổ tay hiện trường: ghi chép thật từ các bài ---------- */
  function fillNotes() {
    var body = document.getElementById('notesBody');
    if (!body || body.getAttribute('data-da-gom')) return;
    var html = '';
    Object.keys(refOf).forEach(function (id) {
      var r = refOf[id], b = DATA.mucs[r[0]].tangs[r[1]].os[r[2]].bais[r[3]];
      (b.body || []).forEach(function (seg) {
        if (seg.type !== 'field_log' || !seg.field_log || !(seg.field_log.body || '').trim()) return;
        var fl = seg.field_log;
        var meta = [fl.place, fl.date].filter(function (v) { return v && v !== '—'; }).join(' · ');
        var paras = fl.body.split('\n').filter(function (s) { return s.trim(); }).map(function (s) { return '<p>' + esc(s.trim()) + '</p>'; }).join('');
        html += '<div class="flog">' + (meta ? '<div class="fl-meta">' + esc(meta) + '</div>' : '') +
          '<div class="fl-body">' + paras + '</div>' +
          '<p class="fl-src"><button type="button" data-ref="' + r.join(',') + '">Trong bài: ' + esc(b.t) + ' →</button></p></div>';
      });
    });
    if (!html) return;
    body.innerHTML = html;
    body.setAttribute('data-da-gom', '1');
    body.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('button[data-ref]');
      if (!btn) return;
      var r = btn.getAttribute('data-ref').split(',').map(Number);
      window.openBai(r[0], r[1], r[2], r[3]);
    });
  }
  fillNotes();
})();
