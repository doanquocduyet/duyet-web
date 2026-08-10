/* ============================================================
   NGHE BÀI — đọc bài viết bằng giọng nói.

   Miễn phí, chạy thẳng trên máy người đọc (Web Speech API),
   không cần máy chủ, không tốn tiền, không giới hạn lượt nghe.
   Ưu tiên giọng nam tiếng Việt, ưu tiên tiếp giọng miền Nam.

   File này tự chứa mọi thứ: giao diện, kiểu dáng, cách chạy.
   Trong index.html chỉ cần đúng một dòng trước thẻ </body>:

       <script src="nghe.js"></script>

   Bản index mới thay chữ nghĩa thế nào cũng không phải sửa gì ở
   đây — trình nghe đọc thẳng chữ đang hiện trên màn hình.
   ============================================================ */
(function(){
  'use strict';

  var has = typeof speechSynthesis !== 'undefined'
         && typeof SpeechSynthesisUtterance !== 'undefined';
  if(!has) return;                    /* máy không đọc được thì thôi, không hiện nút hỏng */

  var RATES = [1, 1.15, 1.3, 0.85];
  var MAX   = 180;                    /* đoạn dài hơn thì trình duyệt hay đứt giữa chừng */

  var voice = null, chunks = [], at = 0, playing = false, rateIx = 0, guardTimer = null;
  var box, btnPlay, lblPlay, btnStop, btnRate;

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
      '.ls-stop[hidden],.ls-rate[hidden]{display:none}'
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
      '<button class="ls-rate" id="lsRate" hidden aria-label="Đổi tốc độ đọc">1×</button>';
    title.parentNode.insertBefore(box, title.nextSibling);
    btnPlay = box.querySelector('#lsPlay');
    lblPlay = box.querySelector('#lsLabel');
    btnStop = box.querySelector('#lsStop');
    btnRate = box.querySelector('#lsRate');
    btnPlay.addEventListener('click', toggle);
    btnStop.addEventListener('click', stop);
    btnRate.addEventListener('click', cycleRate);
    return true;
  }

  function paint(){
    if(!box) return;
    box.classList.toggle('playing', playing);
    lblPlay.textContent = playing ? 'Tạm dừng' : (at > 0 ? 'Nghe tiếp' : 'Nghe bài này');
    var on = playing || at > 0;
    btnStop.hidden = !on;
    btnRate.hidden = !on;
    btnRate.textContent = RATES[rateIx] + '×';
  }

  /* ---------- chọn giọng ---------- */
  function pickVoice(){
    var vs = speechSynthesis.getVoices().filter(function(v){
      return /^vi/i.test(v.lang || '');
    });
    if(!vs.length) return null;
    function score(v){
      var n = (v.name || '').toLowerCase(), s = 0;
      if(/south|mien nam|miền nam|sai gon|sài gòn|hcm/.test(n)) s += 4;   /* giọng miền Nam */
      if(/\bnam\b|male|minh|quang|huy|hoai|standard-b|wavenet-b|neural2-b/.test(n)) s += 3;  /* giọng nam */
      if(/female|nữ|\bnu\b|linh|lan|mai|ngoc|ngọc|standard-a|wavenet-a/.test(n)) s -= 2;
      if(v.localService) s += 1;
      return s;
    }
    return vs.slice().sort(function(a,b){ return score(b) - score(a); })[0];
  }

  /* ---------- cắt câu ---------- */
  function cut(text){
    var out = [];
    text.split(/\n+/).forEach(function(para){
      var t = para.trim();
      if(!t) return;
      var buf = '';
      t.split(/([.!?…:;])\s+/).reduce(function(acc, part, i, arr){
        /* ghép lại dấu câu vào cuối vế trước */
        if(i % 2 === 1) return acc;
        var sen = (part + (arr[i+1] || '')).trim();
        if(sen) acc.push(sen);
        return acc;
      }, []).forEach(function(sen){
        if(sen.length > MAX){
          if(buf){ out.push(buf); buf = ''; }
          sen.split(/(?:,)\s+/).forEach(function(part){
            if((buf + ' ' + part).trim().length > MAX){
              if(buf) out.push(buf.trim());
              buf = part;
            } else buf = (buf + ' ' + part).trim();
          });
          if(buf){ out.push(buf.trim()); buf = ''; }
        } else if((buf + ' ' + sen).trim().length > MAX){
          out.push(buf.trim());
          buf = sen;
        } else buf = (buf + ' ' + sen).trim();
      });
      if(buf) out.push(buf.trim());
    });
    return out.filter(Boolean);
  }

  /* ---------- đọc ---------- */
  function speakNext(){
    if(at >= chunks.length){ playing = false; at = 0; guard(false); paint(); return; }
    var u = new SpeechSynthesisUtterance(chunks[at]);
    if(voice){ u.voice = voice; u.lang = voice.lang; } else u.lang = 'vi-VN';
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
        speechSynthesis.pause();
        speechSynthesis.resume();
      }
    }, 9000);
  }

  function toggle(){
    if(playing){
      speechSynthesis.pause();
      playing = false; guard(false); paint();
      return;
    }
    if(speechSynthesis.paused && speechSynthesis.speaking){
      speechSynthesis.resume();
      playing = true; guard(true); paint();
      return;
    }
    if(!voice) voice = pickVoice();
    playing = true; guard(true); paint(); speakNext();
  }

  function stop(){
    playing = false; at = 0; guard(false);
    try{ speechSynthesis.cancel(); }catch(e){}
    paint();
  }

  function cycleRate(){
    rateIx = (rateIx + 1) % RATES.length;
    if(playing){
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
    chunks = [];
    if(!box) return;
    var bd = document.getElementById('readBody');
    var tt = document.getElementById('readTitle');
    if(!bd || bd.querySelector('.pending-note')){ box.hidden = true; return; }
    var text = (bd.innerText || bd.textContent || '').trim();
    if(!text){ box.hidden = true; return; }
    chunks = cut(((tt && tt.textContent) ? tt.textContent + '. ' : '') + text);
    if(!chunks.length){ box.hidden = true; return; }
    box.hidden = false;
    paint();
  }

  /* ---------- nối vào trang, không cần sửa index.html ---------- */
  function hook(){
    if(!ui()) return;
    css();

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

    speechSynthesis.getVoices();
    speechSynthesis.addEventListener('voiceschanged', function(){
      voice = pickVoice();
    });
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden && playing) toggle();
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
})();
