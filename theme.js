/* ==================================================================
   ตัวสลับธีม — แทรกปุ่มเข้าไปในหัวเว็บทุกหน้าอัตโนมัติ
   จำค่าที่เลือกไว้ใน localStorage และใช้กับทุกหน้าในเว็บ
   ================================================================== */
(function(){
  var KEY='dash_theme';
  var THEMES=[
    {id:'obsidian', name:'Obsidian Gold', c:'#f5b942'},
    {id:'emerald',  name:'Emerald Vault', c:'#34d399'},
    {id:'royal',    name:'Royal Amethyst',c:'#a78bfa'},
    {id:'platinum', name:'Platinum Noir', c:'#cbd5e1'},
    {id:'neon',     name:'Neon District', c:'#22d3ee'},
    {id:'crimson',  name:'Crimson Night', c:'#fb7185'},
    {id:'sbdark',   name:'Almanac Dark',   c:'#D7A23E'},
    {id:'paper',    name:'Paper Light ☀',  c:'#B07D1A'}
  ];
  /* ใส่ธีมก่อนหน้าจอวาด กันภาพกระพริบ */
  var MKEY='dash_mode';
  var cur=null,mode=null;
  try{ cur=localStorage.getItem(KEY); mode=localStorage.getItem(MKEY) }catch(e){}
  if(!cur||!THEMES.some(function(t){return t.id===cur}))cur='obsidian';
  if(mode!=='light'&&mode!=='dark')mode=(cur==='paper'?'light':'dark');
  document.documentElement.setAttribute('data-theme',cur);
  document.documentElement.setAttribute('data-mode',mode);

  function applyMode(m){
    mode=m;
    document.documentElement.setAttribute('data-mode',m);
    try{ localStorage.setItem(MKEY,m) }catch(e){}
    var b=document.getElementById('modeBtn');
    if(b)b.innerHTML=(m==='light'?'☀ สว่าง':'☾ มืด');
  }

  function apply(id){
    cur=id;
    document.documentElement.setAttribute('data-theme',id);
    try{ localStorage.setItem(KEY,id) }catch(e){}
    document.querySelectorAll('.themepop button').forEach(function(b){
      b.classList.toggle('on', b.dataset.t===id);
    });
  }

  function build(){
    var bar=document.querySelector('.hbar');
    if(!bar||document.getElementById('themeBtn'))return;
    var host=bar.querySelector('.right')||bar;

    var wrap=document.createElement('span');
    wrap.className='themebtn';

    var btn=document.createElement('button');
    btn.className='btn'; btn.id='themeBtn'; btn.type='button';
    btn.title='เปลี่ยนธีมสี';
    btn.innerHTML='◐ ธีม';

    var pop=document.createElement('div');
    pop.className='themepop'; pop.style.display='none';
    pop.innerHTML='<div class="ttl">ชุดสี</div>'+THEMES.map(function(t){
      return '<button type="button" data-t="'+t.id+'"'+(t.id===cur?' class="on"':'')+'>'
        +'<span class="swatch" style="background:'+t.c+';color:'+t.c+'"></span>'+t.name+'</button>';
    }).join('');

    btn.onclick=function(e){
      e.stopPropagation();
      pop.style.display=pop.style.display==='none'?'block':'none';
    };
    pop.onclick=function(e){
      var b=e.target.closest('button[data-t]');
      if(b){ apply(b.dataset.t); }
      e.stopPropagation();
    };
    document.addEventListener('click',function(){ pop.style.display='none' });

    var mb=document.createElement('button');
    mb.className='btn'; mb.id='modeBtn'; mb.type='button';
    mb.title='สลับโหมดสว่าง / มืด';
    mb.innerHTML=(mode==='light'?'☀ สว่าง':'☾ มืด');
    mb.onclick=function(){ applyMode(mode==='light'?'dark':'light') };

    wrap.appendChild(btn); wrap.appendChild(pop);
    host.appendChild(mb); host.appendChild(wrap);
  }

  /* ============================================================
     เมนูด้านซ้าย
     ============================================================ */
  var PAGES=[
    {g:'เนื้อหา', items:[
      {h:'agents.html', n:'ทีม AI Agent',  i:'🤖'},
      {h:'brief.html',  n:'Morning Brief', i:'☀'},
      {h:'weekly.html', n:'Market Weekly', i:'📅'}]},
    {g:'ตลาด', items:[
      {h:'heatmap.html',n:'Heat Map',       i:'🔥'},
      {h:'breadth.html',n:'Market Breadth', i:'📊'},
      {h:'sentiment.html',n:'กลัว · โลภ',  i:'😨'},
      {h:'flow.html',   n:'Money Flow',    i:'⇄'},
      {h:'events.html', n:'ปฏิทินเหตุการณ์',i:'📅'}]},
    {g:'วิเคราะห์', items:[
      {h:'scanner.html',n:'Quant Scanner',   i:'⚡'},
      {h:'theme-matrix.html',n:'Thematic Matrix', i:'🧩'},
      {h:'super.html',  n:'Super Investor',   i:'⚖'},
      {h:'macro.html',  n:'Macro Scorecard', i:'🧭'},
      {h:'market.html', n:'ตลาด · กราฟ · ข่าว', i:'📈'}]},
    {g:'เวิร์กสเปซ', items:[
      {h:'index.html',  n:'พอร์ต',    i:'💼'},
      {h:'plan.html',   n:'แผนลงทุน · ปรับสมดุล', i:'🧭'},
      {h:'journal.html',n:'Backtest Journal', i:'📓'},
      {h:'botlab.html', n:'Bot Lab · ทดสอบกลยุทธ์', i:'🧪'},
      {h:'sheet-import.html',n:'นำเข้าจากชีต', i:'📥'},
      {h:'sync.html',   n:'ซิงค์ข้ามเครื่อง', i:'☁'}]}
  ];
  function curPage(){
    var f=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(!f||f==='/')f='index.html';
    return f;
  }
  function buildNav(){
    if(document.getElementById('sidenav'))return;
    var hbar=document.querySelector('.hbar');
    if(!hbar)return;
    var cur=curPage();

    var logo=document.querySelector('.logo');
    var brandHtml=logo?logo.innerHTML:'TRADING <span>DASHBOARD</span>';

    var aside=document.createElement('aside');
    aside.id='sidenav';
    aside.innerHTML='<div class="sbrand">'+brandHtml+'</div>'
      +PAGES.map(function(g){
        return '<div class="sgrp">'+g.g+'</div>'
          +g.items.map(function(it){
            var on=(it.h===cur)||(cur===''&&it.h==='index.html');
            return '<a href="'+it.h+'"'+(on?' class="on"':'')+'>'
              +'<i>'+it.i+'</i>'+it.n+'</a>';
          }).join('');
      }).join('');

    var scrim=document.createElement('div');
    scrim.id='navScrim';
    scrim.onclick=function(){ aside.classList.remove('open'); scrim.classList.remove('on'); };

    document.body.appendChild(aside);
    document.body.appendChild(scrim);
    document.body.classList.add('hasnav');

    /* ซ่อนเมนูเดิม — เฉพาะ nav ที่เป็นลิงก์ข้ามหน้า
       ของ market.html <nav> คือแท็บภายใน ห้ามซ่อน */
    document.querySelectorAll('header nav').forEach(function(n){
      var links=n.querySelectorAll('a[href$=".html"]');
      if(links.length>=2)n.classList.add('sitelinks');
    });

    /* ปุ่ม ☰ สำหรับจอเล็ก */
    var tg=document.createElement('button');
    tg.className='btn'; tg.id='navToggle'; tg.type='button'; tg.innerHTML='☰';
    tg.title='เมนู';
    tg.onclick=function(e){
      e.stopPropagation();
      aside.classList.toggle('open');
      scrim.classList.toggle('on', aside.classList.contains('open'));
    };
    hbar.insertBefore(tg, hbar.firstChild);
  }


  /* ============================================================
     แถบเตือนข้อมูลเก่า — ใส่ให้ทุกหน้าอัตโนมัติ

     ปัญหาที่เจอจริงเมื่อ 13 ต.ค. 2026: งานสแกนรอบวันอังคารไม่ทำงาน
     ข้อมูลบนเว็บจึงค้างอยู่ที่ราคาปิดวันศุกร์ที่ 9  เก่าไป 1 วันทำการ
     แต่ไม่มีหน้าไหนบอกเลยสักหน้า เปิดมาเห็นตัวเลขสวยๆ เหมือนปกติ

     สำหรับกระดานเทรด นี่อันตรายกว่าหน้าว่าง เพราะหน้าว่างยังรู้ว่าเสีย
     แต่ตัวเลขเก่าที่ดูเหมือนใหม่ จะถูกเอาไปตัดสินใจจริง
     ============================================================ */
  var STALE_SKIP=['journal.html','plan.html','botlab.html'];  /* หน้าที่ไม่ได้พึ่ง scan.json */
  function tradingDaysBetween(a,b){
    /* นับเฉพาะวันจันทร์-ศุกร์ ไม่นับวันหยุดนักขัตฤกษ์ (ยอมคลาดได้ 1 วัน)
       ถ้านับวันปฏิทินดิบ ทุกเช้าวันจันทร์จะขึ้นเตือนทั้งที่ข้อมูลถูกต้อง */
    var n=0, d=new Date(a);
    /* ต้องเพิ่มวันก่อนแล้วค่อยเช็กว่าเลยปลายทางหรือยัง
       ถ้าเช็กก่อนเพิ่ม รอบสุดท้ายจะนับวันที่ยังมาไม่ถึงเข้าไปด้วย
       ทำให้ขึ้นเตือนทั้งที่ข้อมูลยังสด (เจอตอนทดสอบ ศ.9 -> จ.12 ได้ 2 ทั้งที่ควรเป็น 1) */
    while(true){
      d.setUTCDate(d.getUTCDate()+1);
      if(d>b)break;
      var w=d.getUTCDay(); if(w>=1&&w<=5)n++;
    }
    return n;
  }
  function staleBar(){
    if(STALE_SKIP.indexOf(curPage())>=0)return;
    fetch('scan.json?t='+Date.now(),{cache:'no-store'}).then(function(r){
      if(!r.ok)throw new Error('ไม่พบ scan.json');
      return r.json();
    }).then(function(j){
      if(!j||!j.asof)return;
      var asof=new Date(j.asof+'T00:00:00Z');
      var now=new Date();
      /* ราคาปิดของวันนี้จะมีก็ต่อเมื่อตลาดสหรัฐฯ ปิดแล้ว (ราว 03:00 ไทย)
         จึงถือว่าข้อมูลล่าสุดที่ควรมี คือวันทำการก่อนหน้าวันนี้ */
      var gap=tradingDaysBetween(asof,now)-1;
      if(gap<=1)return;                       /* ช้า 1 วันทำการถือว่าปกติ */
      var sev=gap>=3?'bad':'warn';
      var bar=document.createElement('div');
      bar.id='staleBar'; bar.className='stalebar '+sev;
      bar.innerHTML='<b>ข้อมูลเก่า '+gap+' วันทำการ</b> — ตัวเลขบนหน้านี้คิดจากราคาปิด '
        +j.asof+' งานสแกนรอบล่าสุดน่าจะไม่ทำงาน '
        +'<a href="https://github.com/mekysk/trading-dashboard/actions/workflows/scan.yml" '
        +'target="_blank" rel="noopener">ดูสถานะงาน ↗</a>'
        +'<button type="button" class="x" title="ปิด">✕</button>';
      bar.querySelector('.x').onclick=function(){ bar.remove() };
      var main=document.querySelector('main');
      if(main)main.insertBefore(bar,main.firstChild); else document.body.appendChild(bar);
    }).catch(function(){ /* หน้าที่ไม่ได้ใช้ scan.json ก็ไม่ต้องเตือนอะไร */ });
  }


  /* ============================================================
     ซิงค์ข้อมูลข้ามเครื่อง — เรียกตอนเปิดหน้า ถ้าตั้งค่าไว้แล้ว

     ของส่วนตัว (พอร์ต สมุดเทรด watchlist) เก็บใน localStorage
     ซึ่งแยกตามที่อยู่เว็บและแยกตามเครื่อง  เปิดคนละที่จึงไม่เห็นกัน
     ตัวนี้ทำให้ตามกันได้ โดยข้อมูลถูกเข้ารหัสก่อนออกจากเครื่องเสมอ

     กติกา: ห้ามทำให้หน้าเว็บพังถ้าซิงค์ล้มเหลว
     ข้อมูลในเครื่องคือของจริง คลาวด์เป็นแค่สำเนา
     ============================================================ */
  function syncChip(txt,kind,title){
    var bar=document.querySelector('.hbar'); if(!bar)return;
    var host=bar.querySelector('.right')||bar;
    var el=document.getElementById('syncChip');
    if(!el){ el=document.createElement('a'); el.id='syncChip';
      el.href='sync.html'; el.className='syncchip'; host.insertBefore(el,host.firstChild) }
    el.className='syncchip '+(kind||'');
    el.textContent=txt;
    el.title=title||'ตั้งค่าซิงค์ข้ามเครื่อง';
  }
  function runSync(){
    if(typeof SYNC==='undefined'||!SYNC.ready())return;   /* ยังไม่ตั้งค่า = เงียบไว้ */
    syncChip('☁ กำลังซิงค์','busy');
    SYNC.auto().then(function(r){
      if(r.conflict){
        syncChip('☁ ขัดกัน','bad',r.msg+' — กดเพื่อไปเลือกเอง');
        return;
      }
      syncChip('☁ '+r.state,'ok','ซิงค์เรียบร้อย กดเพื่อดูรายละเอียด');
      /* ถ้าดึงของใหม่ลงมา หน้าที่เปิดอยู่ยังถือข้อมูลเก่าในหน่วยความจำ
         ต้องโหลดใหม่ ไม่งั้นผู้ใช้จะเห็นของเก่าแล้วเผลอแก้ทับของใหม่ */
      if(r.reload){
        syncChip('☁ ได้ข้อมูลใหม่ กำลังโหลดหน้า','ok');
        setTimeout(function(){ location.reload() },700);
      }
    }).catch(function(e){
      var m=String(e&&e.message||e);
      syncChip('☁ ซิงค์ไม่สำเร็จ','bad',m);
    });
  }

  /* เปิดให้หน้าอื่นเรียกใช้ตัวนับวันทำการได้
     ตัวนี้เคยมีบั๊กนับเกิน 1 วัน แก้แล้วและทดสอบแล้ว
     ถ้าหน้าอื่นเขียนตัวนับของตัวเองขึ้นมาใหม่ บั๊กเดิมจะกลับมาอีกรอบ
     จึงให้ใช้ตัวเดียวกันทั้งเว็บ */
  window.TRADINGDAYS=tradingDaysBetween;

  function boot(){ buildNav(); build(); staleBar(); runSync(); }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
