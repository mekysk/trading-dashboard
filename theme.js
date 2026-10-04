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
      {h:'macro.html',  n:'Macro Scorecard', i:'🧭'},
      {h:'market.html', n:'ตลาด · กราฟ · ข่าว', i:'📈'}]},
    {g:'เวิร์กสเปซ', items:[
      {h:'index.html',  n:'พอร์ต',    i:'💼'},
      {h:'plan.html',   n:'แผนลงทุน · ปรับสมดุล', i:'🧭'},
      {h:'journal.html',n:'Backtest Journal', i:'📓'},
      {h:'botlab.html', n:'Bot Lab · ทดสอบกลยุทธ์', i:'🧪'}]}
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

  function boot(){ buildNav(); build(); }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
