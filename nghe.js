/* ============================================================
   NGHE BÀI — đọc bài viết bằng giọng nói.

   Thứ tự ưu tiên:
     1. File thu sẵn ở audio/<mã bài>.mp3 — giọng nam tiếng Việt
        vi-VN-NamMinhNeural (Microsoft Neural), thu bằng edge-tts
        qua workflow generate-audio-free.yml. Nghe hay nhất, giống
        nhau trên mọi máy.
     2. Máy chưa có file thu thì dùng giọng tiếng Việt cài sẵn
        trong máy người đọc (Web Speech API).
     3. Máy không có giọng tiếng Việt thì ẩn nút luôn — thà không
        có còn hơn đọc bằng giọng ngoại quốc.

   Trong index.html chỉ cần đúng một dòng trước thẻ </body>:
       <script src="nghe.js"></script>
   ============================================================ */
(function(){
  'use strict';

  var RATES = [1, 1.25, 1.5, 2];
  var MAX   = 180;              /* đoạn dài hơn thì trình duyệt hay đứt giữa chừng */
  var NHO   = 'duyet-toc-do';   /* nhớ tốc độ người nghe đã chọn */

  var speech = typeof speechSynthesis !== 'undefined'
            && typeof SpeechSynthesisUtterance !== 'undefined';

  var manifest = null;          /* danh mục file thu sẵn */
  var audio = null;             /* thẻ audio khi có file thu */
  var mode = '';                /* 'mp3' | 'may' | '' */
  var voice = null, chunks = [], at = 0, playing = false, rateIx = 0, guardTimer = null;
  var box, btnPlay, lblPlay, btnStop, btnRate, elTime;

  /* ---------- mã bài: phải giống hệt slug() trong tools/extract.js ---------- */
  function slug(s){
    return (s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /* ---------- kiểu dáng ---------- */
  function css(){
    var s = document.createElement('style');
    s.textContent = [
      '.listen{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:-1.1rem 0 2rem}',
      '.listen[hidden]{display:none}',
      '.listen button{font-family:var(--sans);background:none;cursor:pointer;color:var(--text-2);transition:color .3s,border-color .3s;-webkit-tap-highlight-color:transparent}',
      '.ls-play{display:flex;align-items:center;gap:.5rem;min-height:40px;padding:.35rem .95rem .35rem .8rem;border:1px solid var(--gold-line);border-radius:999px;font-size:.78rem;letter-spacing:.06em}',
      '.ls-play:hover{color:var(--gold);border-color:var(--gold)}',
      '.ls-ico{width:13px;height:13px;fill:var(--gold);flex-shrink:0}',
      '.listen.playing .ls-play{color:var(--gold);border-color:var(--gold)}',
      '.ls-stop{min-height:40px;padding:.35rem .7rem;border:none;font-size:.74rem;letter-spacing:.08em}',
      '.ls-rate{min-height:40px;padding:.35rem .7rem;border:1px solid var(--gold-line);border-radius:999px;min-width:44px;font-size:.74rem;letter-spacing:.06em}',
      '.ls-stop:hover{color:var(--gold)}',
      '.ls-rate:hover{color:var(--gold);border-color:var(--gold)}',
      '.ls-time{font-family:var(--sans);font-size:.72rem;letter-spacing:.06em;color:var(--text-2);font-variant-numeric:tabular-nums}',
      '.ls-stop[hidden],.ls-rate[hidden],.ls-time[hidden]{display:none}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- giao diện, gắn ngay dưới tựa bài ---------- */
  function ui(){
    var title = document.getElementById('readTitle');
    if(!title) return false;
    box = document.createElement('div');
    box.className = 'listen';
    box.id = 'listen';
    box.hidden = true;
    box.innerHTML =
      '<button class="ls-play" id="lsPlay" aria-label="Nghe bài này">' +
        '<svg class="ls-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        '<span id="lsLabel">Nghe bài này</span>' +
      '</button>' +
      '<button class="ls-stop" id="lsStop" hidden aria-label="Dừng đọc">Dừng</button>' +
      '<button class="ls-rate" id="lsRate" hidden aria-label="Đổi tốc độ đọc">1×</button>' +
      '<span class="ls-time" id="lsTime" hidden></span>';
    title.parentNode.insertBefore(box, title.nextSibling);
    btnPlay = box.querySelector('#lsPlay');
    lblPlay = box.querySelector('#lsLabel');
    btnStop = box.querySelector('#lsStop');
    btnRate = box.querySelector('#lsRate');
    elTime  = box.querySelector('#lsTime');
    btnPlay.addEventListener('click', toggle);
    btnStop.addEventListener('click', stop);
    btnRate.addEventListener('click', cycleRate);
    return true;
  }

  function mmss(s){
    if(!isFinite(s) || s < 0) return '';
    var m = Math.floor(s / 60), x = Math.floor(s % 60);
    return m + ':' + (x < 10 ? '0' : '') + x;
  }

  function paint(){
    if(!box) return;
    box.classList.toggle('playing', playing);
    var started = playing || at > 0 || (audio && audio.currentTime > 0);
    lblPlay.textContent = playing ? 'Tạm dừng' : (started ? 'Nghe tiếp' : 'Nghe bài này');
    btnStop.hidden = !started;
    btnRate.hidden = false;                 /* chọn tốc độ được ngay từ đầu */
    btnRate.textContent = RATES[rateIx] + '×';
    if(mode === 'mp3' && audio && isFinite(audio.duration)){
      elTime.hidden = false;
      elTime.textContent = mmss(audio.currentTime) + ' / ' + mmss(audio.duration);
    } else elTime.hidden = true;
  }

  /* ---------- giọng cài sẵn trong máy ---------- */
  function pickVoice(){
    if(!speech) return null;
    var vs = speechSynthesis.getVoices().filter(function(v){
      return /^vi/i.test(v.lang || '');
    });
    if(!vs.length) return null;                 /* không có giọng Việt thì thôi */
    function score(v){
      var n = (v.name || '').toLowerCase(), s = 0;
      if(/south|mien nam|miền nam|sai gon|sài gòn|hcm/.test(n)) s += 4;
      if(/\bnam\b|male|minh|quang|huy|hoai|standard-b|wavenet-b|neural2-b/.test(n)) s += 3;
      if(/female|nữ|\bnu\b|linh|lan|mai|ngoc|ngọc|standard-a|wavenet-a/.test(n)) s -= 2;
      if(v.localService) s += 1;
      return s;
    }
    return vs.slice().sort(function(a,b){ return score(b) - score(a); })[0];
  }

  /* ---------- cắt câu cho giọng máy ---------- */
  function cut(text){
    var out = [];
    text.split(/\n+/).forEach(function(para){
      var t = para.trim();
      if(!t) return;
      var buf = '', sens = [];
      t.split(/([.!?…:;])\s+/).forEach(function(part, i, arr){
        if(i % 2 === 1) return;
        var sen = (part + (arr[i+1] || '')).trim();
        if(sen) sens.push(sen);
      });
      sens.forEach(function(sen){
        if(sen.length > MAX){
          if(buf){ out.push(buf); buf = ''; }
          sen.split(/(?:,)\s+/).forEach(function(p){
            if((buf + ' ' + p).trim().length > MAX){ if(buf) out.push(buf.trim()); buf = p; }
            else buf = (buf + ' ' + p).trim();
          });
          if(buf){ out.push(buf.trim()); buf = ''; }
        } else if((buf + ' ' + sen).trim().length > MAX){ out.push(buf.trim()); buf = sen; }
        else buf = (buf + ' ' + sen).trim();
      });
      if(buf) out.push(buf.trim());
    });
    return out.filter(Boolean);
  }

  function speakNext(){
    if(at >= chunks.length){ playing = false; at = 0; guard(false); paint(); return; }
    var u = new SpeechSynthesisUtterance(chunks[at]);
    u.voice = voice; u.lang = voice.lang;       /* chỉ chạy khi đã chắc có giọng Việt */
    u.rate = RATES[rateIx];
    u.pitch = 1;
    u.onend = function(){ if(playing){ at++; speakNext(); } };
    u.onerror = function(){ playing = false; guard(false); paint(); };
    speechSynthesis.speak(u);
  }

  /* Chrome tự ngắt sau khoảng mười lăm giây nếu không đụng tới */
  function guard(on){
    clearInterval(guardTimer);
    if(!on) return;
    guardTimer = setInterval(function(){
      if(!playing){ clearInterval(guardTimer); return; }
      if(speechSynthesis.speaking && !speechSynthesis.paused){
        speechSynthesis.pause(); speechSynthesis.resume();
      }
    }, 9000);
  }

  /* ---------- điều khiển ---------- */
  /* giữ nguyên cao độ giọng khi nghe nhanh, để 1.5x hay 2x không bị the thé */
  function setRate(){
    if(!audio) return;
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.playbackRate = RATES[rateIx];
  }

  function toggle(){
    if(mode === 'mp3'){
      if(!audio) return;
      if(playing){ audio.pause(); playing = false; }
      else { setRate(); audio.play(); playing = true; }
      paint();
      return;
    }
    if(mode !== 'may') return;
    if(playing){ speechSynthesis.pause(); playing = false; guard(false); paint(); return; }
    if(speechSynthesis.paused && speechSynthesis.speaking){
      speechSynthesis.resume(); playing = true; guard(true); paint(); return;
    }
    playing = true; guard(true); paint(); speakNext();
  }

  function stop(){
    playing = false; at = 0; guard(false);
    if(audio){ try{ audio.pause(); audio.currentTime = 0; }catch(e){} }
    if(speech){ try{ speechSynthesis.cancel(); }catch(e){} }
    paint();
  }

  function cycleRate(){
    rateIx = (rateIx + 1) % RATES.length;
    try{ localStorage.setItem(NHO, String(rateIx)); }catch(e){}
    if(mode === 'mp3'){
      setRate();
    } else if(playing){
      var back = at;
      speechSynthesis.cancel();
      at = back;
      speakNext();
    }
    paint();
  }

  /* ---------- nạp bài đang mở ---------- */
  function load(){
    stop();
    chunks = []; mode = ''; at = 0;
    if(audio){ audio.src = ''; audio = null; }
    if(!box) return;

    var bd = document.getElementById('readBody');
    var tt = document.getElementById('readTitle');
    if(!bd || bd.querySelector('.pending-note')){ box.hidden = true; return; }

    var title = (tt && tt.textContent) ? tt.textContent.trim() : '';
    var id = slug(title);

    /* 1. có file thu sẵn thì dùng */
    if(manifest && manifest.bai && manifest.bai[id]){
      mode = 'mp3';
      audio = new Audio('audio/' + manifest.bai[id].f);
      audio.preload = 'metadata';
      setRate();
      audio.addEventListener('timeupdate', paint);
      audio.addEventListener('loadedmetadata', paint);
      audio.addEventListener('ended', function(){ playing = false; audio.currentTime = 0; paint(); });
      audio.addEventListener('error', function(){        /* file hỏng thì quay về giọng máy */
        audio = null;
        if(useMachineVoice(title, bd)) paint(); else box.hidden = true;
      });
      box.hidden = false;
      paint();
      return;
    }

    /* 2. chưa có file thu — dùng giọng tiếng Việt cài sẵn, nếu có */
    if(useMachineVoice(title, bd)){ box.hidden = false; paint(); return; }

    /* 3. không có gì đọc được thì ẩn nút */
    box.hidden = true;
  }

  function useMachineVoice(title, bd){
    if(!speech) return false;
    voice = pickVoice();
    if(!voice) return false;                 /* không đọc bằng giọng ngoại quốc */
    var text = (bd.innerText || bd.textContent || '').trim();
    if(!text) return false;
    chunks = cut((title ? title + '. ' : '') + text);
    if(!chunks.length) return false;
    mode = 'may';
    return true;
  }

  /* ---------- nối vào trang, không cần sửa index.html ---------- */
  function hook(){
    if(!ui()) return;
    css();

    try{                                      /* lấy lại tốc độ lần trước đã chọn */
      var nho = parseInt(localStorage.getItem(NHO), 10);
      if(nho >= 0 && nho < RATES.length) rateIx = nho;
    }catch(e){}

    if(typeof window.openBai === 'function'){
      var origOpen = window.openBai;
      window.openBai = function(){
        var r = origOpen.apply(this, arguments);
        load();
        return r;
      };
    }
    if(typeof window.go === 'function'){
      var origGo = window.go;
      window.go = function(id){
        if(id !== 'reader') stop();
        return origGo.apply(this, arguments);
      };
    }

    if(speech){
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener('voiceschanged', function(){
        if(mode !== 'mp3') load();
      });
    }
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden && playing) toggle();
    });

    /* lấy danh mục file thu sẵn; không có cũng không sao */
    if(typeof fetch === 'function'){
      fetch('audio/manifest.json', { cache: 'no-cache' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if(!j || !j.bai) return;
          manifest = j;
          if(document.getElementById('reader').classList.contains('active')) load();
        })
        .catch(function(){});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
})();
