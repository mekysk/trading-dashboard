/* ==================================================================
   engine.js — เครื่องคำนวณกลางของสแกนเนอร์
   ไฟล์นี้ถูกใช้ทั้งฝั่ง GitHub Actions (Node) และฝั่งเบราว์เซอร์
   เพื่อให้ตัวเลขที่ได้ "ตรงกันเสมอ" ไม่ว่าเปิดจากทางไหน
   ================================================================== */
(function(root){
'use strict';

/* ---------- เครื่องมือพื้นฐาน ---------- */
function sma(arr,n,end){            /* ค่าเฉลี่ย n วันสุดท้ายถึง index end */
  if(end==null)end=arr.length-1;
  if(end-n+1<0)return null;
  var s=0; for(var i=end-n+1;i<=end;i++){ if(!isFinite(arr[i]))return null; s+=arr[i]; }
  return s/n;
}
function maxOf(a,from,to){var m=-Infinity;for(var i=from;i<=to;i++)if(a[i]>m)m=a[i];return m}
function minOf(a,from,to){var m=Infinity;for(var i=from;i<=to;i++)if(a[i]<m)m=a[i];return m}

/* ผลตอบแทนย้อนหลัง d วัน (%) — คืน null ถ้าข้อมูลไม่พอ ไม่เดา */
function ret(c,d){
  var n=c.length;
  if(n<d+1)return null;
  var a=c[n-1-d];
  if(!isFinite(a)||a<=0)return null;
  return (c[n-1]/a-1)*100;
}

/* RSI แบบ Wilder */
function rsi(c,p){
  p=p||14;
  if(c.length<p+1)return null;
  var g=0,l=0,i;
  for(i=1;i<=p;i++){var d=c[i]-c[i-1]; if(d>0)g+=d; else l-=d;}
  g/=p; l/=p;
  for(i=p+1;i<c.length;i++){
    var d2=c[i]-c[i-1];
    g=(g*(p-1)+(d2>0?d2:0))/p;
    l=(l*(p-1)+(d2<0?-d2:0))/p;
  }
  if(l===0)return g===0?50:100;
  return 100-100/(1+g/l);
}

/* OBV และความชันของมันในช่วง look วันหลังสุด (ปรับให้เทียบกันได้ข้ามหุ้น) */
function obvSlope(c,v,look){
  look=look||21;
  if(c.length<look+2)return null;
  var o=[0],i;
  for(i=1;i<c.length;i++)
    o.push(o[i-1]+(c[i]>c[i-1]?v[i]:c[i]<c[i-1]?-v[i]:0));
  var seg=o.slice(-look), n=seg.length;
  var sx=0,sy=0,sxy=0,sxx=0;
  for(i=0;i<n;i++){sx+=i;sy+=seg[i];sxy+=i*seg[i];sxx+=i*i;}
  var den=n*sxx-sx*sx; if(den===0)return null;
  var slope=(n*sxy-sx*sy)/den;
  var avgV=sma(v,Math.min(50,v.length));
  if(!avgV)return null;
  return slope/avgV;      /* หน่วย: กี่เท่าของวอลุ่มเฉลี่ยต่อวัน */
}

/* RS ดิบแบบถ่วงน้ำหนัก ให้น้ำหนักช่วงล่าสุดมากกว่า (แนว IBD)
   ต้องมีข้อมูลครบ 252 วัน ไม่งั้นคืน null — ไม่เอาหุ้นเพิ่งเข้าตลาดมาเทียบกับหุ้นเก่า */
function rsRaw(c){
  var a=ret(c,63),b=ret(c,126),d=ret(c,189),e=ret(c,252);
  if(a==null||b==null||d==null||e==null)return null;
  return 0.4*a+0.2*b+0.2*d+0.2*e;
}

/* แปลงค่าดิบเป็นเปอร์เซ็นไทล์ 1-99 โดยอิงอันดับ
   ตัวแย่สุด = 1, ตัวดีสุด = 99 เสมอ */
function percentiler(vals){
  var s=vals.filter(function(x){return x!=null&&isFinite(x)})
            .slice().sort(function(x,y){return x-y});
  var n=s.length;
  return function(v){
    if(v==null||!isFinite(v)||n===0)return null;
    if(n===1)return 50;
    var lo=0,hi=n;
    while(lo<hi){var m=(lo+hi)>>1; if(s[m]<v)lo=m+1; else hi=m;}
    var gt=lo;                      /* จำนวนตัวที่น้อยกว่า v */
    while(gt<n&&s[gt]===v)gt++;     /* ให้ค่าเท่ากันได้อันดับเดียวกัน */
    var rank=(lo+gt-1)/2;           /* กลางของกลุ่มที่ค่าเท่ากัน */
    return 1+Math.round(98*rank/(n-1));
  };
}

/* ---------- ตัวชี้วัดต่อหุ้นหนึ่งตัว ---------- */
/* bars = [{d,o,h,l,c,v}, ...] เรียงเก่า -> ใหม่ */
function metrics(bars){
  if(!bars||bars.length<60)return null;      /* สั้นเกินไป ไม่คำนวณ ไม่เดา */
  var n=bars.length;
  var c=bars.map(function(b){return b.c}),
      h=bars.map(function(b){return b.h}),
      lo=bars.map(function(b){return b.l}),
      v=bars.map(function(b){return b.v});
  var last=bars[n-1];
  var m={sym:null,date:last.d,close:last.c,bars:n};

  m.chg1=ret(c,1); m.chg5=ret(c,5); m.chg21=ret(c,21);
  m.chg63=ret(c,63); m.chg126=ret(c,126); m.chg252=ret(c,252);
  m.rsRaw=rsRaw(c);

  /* 52 สัปดาห์ — ใช้เท่าที่มี แต่บอกจำนวนวันที่ใช้จริงไว้ */
  var w=Math.min(252,n), from=n-w;
  m.win=w;
  m.hi52=maxOf(h,from,n-1); m.lo52=minOf(lo,from,n-1);
  m.fromHigh=m.hi52>0?(last.c/m.hi52-1)*100:null;   /* ติดลบ = ต่ำกว่าไฮเท่าไหร่ */
  m.aboveLow=m.lo52>0?(last.c/m.lo52-1)*100:null;

  m.ma50=sma(c,50); m.ma150=n>=150?sma(c,150):null; m.ma200=n>=200?sma(c,200):null;
  m.ma200prev=n>=221?sma(c,200,n-22):null;
  m.ma200up=(m.ma200!=null&&m.ma200prev!=null)?m.ma200>m.ma200prev:null;

  /* ค่าเฉลี่ยวอลุ่มต้อง "ไม่รวมวันนี้" ไม่งั้นวันที่วอลุ่มพุ่งจะไปดันค่าเฉลี่ยขึ้นเอง
     ทำให้ตัวคูณที่ได้ต่ำกว่าความจริง และซ่อนวันที่วอลุ่มพุ่งแรงที่สุด */
  var vw=Math.min(50,n-1);
  m.avgVol50=vw>=5?sma(v,vw,n-2):null;
  m.volSpike=(m.avgVol50&&m.avgVol50>0)?last.v/m.avgVol50:null;
  m.dollarVol=last.c*last.v;
  m.avgDollarVol50=null;
  if(vw>=5){var s=0;for(var i=n-1-vw;i<n-1;i++)s+=c[i]*v[i];m.avgDollarVol50=s/vw;}
  m.obv=obvSlope(c,v,21);
  m.rsi=rsi(c,14);

  /* --- Trend Template (Minervini) 7 ข้อที่ไม่ต้องใช้ RS --- */
  var t=[];
  t.push(m.ma150!=null&&m.ma200!=null?(last.c>m.ma150&&last.c>m.ma200):null);
  t.push(m.ma150!=null&&m.ma200!=null?(m.ma150>m.ma200):null);
  t.push(m.ma200up);
  t.push(m.ma50!=null&&m.ma150!=null&&m.ma200!=null?(m.ma50>m.ma150&&m.ma50>m.ma200):null);
  t.push(m.ma50!=null?last.c>m.ma50:null);
  t.push(m.aboveLow!=null?m.aboveLow>=30:null);
  t.push(m.fromHigh!=null?m.fromHigh>=-25:null);
  m.tt=t;
  m.ttPass=t.filter(function(x){return x===true}).length;
  m.ttKnown=t.filter(function(x){return x!=null}).length;

  /* --- VCP: ช่วงแกว่งต้องแคบลงต่อเนื่อง 3 ช่วง --- */
  m.vcp=false; m.vcpRanges=null;
  if(n>=60){
    var r=[];
    for(var k=2;k>=0;k--){
      var e2=n-1-k*20, s2=e2-19;
      if(s2<0){r=null;break}
      var hh=maxOf(h,s2,e2), ll=minOf(lo,s2,e2);
      if(!(ll>0)){r=null;break}
      r.push((hh-ll)/ll*100);
    }
    if(r){
      m.vcpRanges=r;
      /* บีบแคบลงทุกช่วง และช่วงสุดท้ายแคบกว่าช่วงแรกอย่างน้อย 40% */
      m.vcp=(r[0]>r[1]&&r[1]>r[2]&&r[2]<=r[0]*0.6&&m.fromHigh!=null&&m.fromHigh>=-25);
    }
  }

  /* --- VDU: วอลุ่มแห้ง ขณะยังอยู่ใกล้ไฮ --- */
  m.vdu=(m.volSpike!=null&&m.fromHigh!=null&&m.volSpike<0.6&&m.fromHigh>=-15);

  /* --- pivot = จุดสูงสุด 30 วันก่อนหน้า (ไม่รวมวันนี้) --- */
  m.pivot=n>=31?maxOf(h,n-31,n-2):null;
  m.toPivot=(m.pivot&&m.pivot>0)?(last.c/m.pivot-1)*100:null;
  m.nearPivot=(m.toPivot!=null&&m.toPivot<=0&&m.toPivot>=-4);
  m.breakout=(m.toPivot!=null&&m.toPivot>0&&m.volSpike!=null&&m.volSpike>=1.5);

  /* --- PPBP: หลุด MA50 ใน 10 วันหลัง แล้วกลับขึ้นมายืนได้ --- */
  m.ppbp=false;
  if(m.ma50!=null&&n>=60){
    var dipped=false;
    for(var j=Math.max(1,n-10);j<n;j++){
      var ma=sma(c,50,j);
      if(ma!=null&&c[j]<ma)dipped=true;
    }
    m.ppbp=dipped&&last.c>m.ma50&&m.fromHigh!=null&&m.fromHigh>=-20;
  }

  /* --- กลับตัว: ขายมากเกิน / เด้งจากแนวรับ --- */
  m.oversold=(m.rsi!=null&&m.rsi<30);
  m.bounce=false;
  if(m.ma50!=null&&n>=55){
    var touched=false;
    for(var q=Math.max(1,n-5);q<n;q++){
      var ma2=sma(c,50,q);
      if(ma2!=null&&lo[q]<=ma2*1.02&&c[q]>=ma2*0.98)touched=true;
    }
    m.bounce=touched&&last.c>m.ma50&&last.c>c[n-2];
  }
  m.volDry=(m.volSpike!=null&&m.volSpike<0.6);
  m.volSurge=(m.volSpike!=null&&m.volSpike>=2);
  return m;
}

/* เติม rs (1-99) และข้อที่ 8 ของ trend template ให้ทั้งชุด */
function addRank(list){
  var p=percentiler(list.map(function(m){return m?m.rsRaw:null}));
  list.forEach(function(m){
    if(!m)return;
    m.rs=p(m.rsRaw);
    m.ttRS=(m.rs!=null)?m.rs>=70:null;
    var t=m.tt.concat([m.ttRS]);
    m.ttPass=t.filter(function(x){return x===true}).length;
    m.ttKnown=t.filter(function(x){return x!=null}).length;
    m.ttFull=(m.ttKnown===8&&m.ttPass===8);
  });
  var pd=percentiler(list.map(function(m){return m?m.avgDollarVol50:null}));
  list.forEach(function(m){ if(m)m.liq=pd(m.avgDollarVol50) });
  return list;
}

/* แปลง CSV ของ Stooq เป็นแท่งราคา — ทิ้งแถวที่ข้อมูลไม่ครบ ไม่เติมเอง */
function parseCsv(text){
  if(!text)return null;
  var L=String(text).trim().split('\n');
  if(L.length<10)return null;
  var out=[];
  for(var i=1;i<L.length;i++){
    var a=L[i].split(',');
    var o=+a[1],hh=+a[2],ll=+a[3],cc=+a[4],vv=+a[5];
    if(!a[0]||!isFinite(cc)||cc<=0||!isFinite(hh)||!isFinite(ll))continue;
    out.push({d:a[0],o:isFinite(o)?o:cc,h:hh,l:ll,c:cc,v:isFinite(vv)?vv:0});
  }
  return out.length>=60?out:null;
}

/* ชื่อสัญลักษณ์สำหรับ Stooq: BRK.B -> brk-b.us */
function stooqSym(s){
  return String(s).toLowerCase().replace(/\./g,'-')+'.us';
}


/* ==================================================================
   ตัววัด "แรงซื้อขายในราคา" สำหรับหน้า Money Flow
   ย้ำ: ทั้งหมดนี้คำนวณจากราคาและวอลุ่ม ไม่ใช่เงินเข้า-ออกกองทุนจริง
   ================================================================== */

/* Money Flow Index — เหมือน RSI แต่ถ่วงด้วยวอลุ่ม 0-100 */
function mfi(bars,p){
  p=p||14;
  if(!bars||bars.length<p+1)return null;
  var pos=0,neg=0,i,used=0;
  for(i=bars.length-p;i<bars.length;i++){
    var a=bars[i],b=bars[i-1];
    var tp=(a.h+a.l+a.c)/3, tpPrev=(b.h+b.l+b.c)/3;
    if(!isFinite(tp)||!isFinite(tpPrev))continue;
    var raw=tp*(a.v||0);
    if(tp>tpPrev)pos+=raw; else if(tp<tpPrev)neg+=raw;
    used++;
  }
  if(used<p)return null;
  if(pos+neg===0)return 50;      /* ราคานิ่งสนิท ไม่เอียงไปทางไหน */
  return 100*pos/(pos+neg);
}

/* Chaikin Money Flow — ตำแหน่งที่ปิดในกรอบวัน ถ่วงด้วยวอลุ่ม -1 ถึง +1
   ปิดใกล้ไฮ = แรงซื้อ, ปิดใกล้โลว์ = แรงขาย */
function cmf(bars,p){
  p=p||20;
  if(!bars||bars.length<p)return null;
  var sm=0,sv=0;
  for(var i=bars.length-p;i<bars.length;i++){
    var b=bars[i], rng=b.h-b.l, v=b.v||0;
    if(!isFinite(rng)||v<=0)continue;
    var mult=rng===0?0:((b.c-b.l)-(b.h-b.c))/rng;
    sm+=mult*v; sv+=v;
  }
  if(sv<=0)return null;
  return sm/sv;
}

/* มูลค่าซื้อขายเฉลี่ย n วันล่าสุด (ราคา x วอลุ่ม) */
function dollarVol(bars,n){
  if(!bars||bars.length<n)return null;
  var s=0;
  for(var i=bars.length-n;i<bars.length;i++)s+=bars[i].c*(bars[i].v||0);
  return s/n;
}

/* จับคู่สองสินทรัพย์ตามวันที่ แล้วคืนอนุกรมอัตราส่วน a/b
   ใช้เฉพาะวันที่มีข้อมูลทั้งคู่ — ถ้าวันไหนขาดฝั่งใดฝั่งหนึ่งจะข้ามไป
   ไม่เติมราคาย้อนหลังให้ เพราะจะสร้างวันซื้อขายที่ไม่เคยมีอยู่จริง */
function ratioSeries(a,b){
  if(!a||!b)return null;
  var map={},i;
  for(i=0;i<b.length;i++)map[b[i].d]=b[i].c;
  var out=[];
  for(i=0;i<a.length;i++){
    var y=map[a[i].d];
    if(y==null||!(y>0)||!(a[i].c>0))continue;
    out.push({d:a[i].d,c:a[i].c/y});
  }
  return out.length>=30?out:null;
}

/* สรุปอัตราส่วนหนึ่งคู่: ค่าปัจจุบัน, เปลี่ยนแปลงหลายช่วง, อยู่เหนือ MA50 ไหม */
function ratioStat(a,b){
  var s=ratioSeries(a,b);
  if(!s)return null;
  var c=s.map(function(x){return x.c}), n=c.length;
  var ma50=sma(c,Math.min(50,n));
  return {
    n:n, date:s[n-1].d, val:c[n-1],
    w1:ret(c,5), m1:ret(c,21), m3:ret(c,63), y1:n>252?ret(c,252):null,
    ma50:ma50, aboveMA:(ma50!=null&&ma50>0)?c[n-1]>ma50:null,
    series:c.slice(-252)
  };
}

root.SCANENG={sma:sma,ret:ret,rsi:rsi,obvSlope:obvSlope,rsRaw:rsRaw,
  percentiler:percentiler,metrics:metrics,addRank:addRank,
  parseCsv:parseCsv,stooqSym:stooqSym,
  mfi:mfi,cmf:cmf,dollarVol:dollarVol,ratioSeries:ratioSeries,ratioStat:ratioStat};

/* ==================================================================
   เครื่องมือสำหรับดัชนีความรู้สึกตลาด
   ================================================================== */

/* จัดอนุกรมหลายตัวให้ตรงวันกัน โดยยึดวันของตัวแรกเป็นแกน
   วันไหนที่ตัวอื่นไม่มีข้อมูล จะได้ null ไม่ใช่ราคาวันก่อนหน้า */
function alignAll(spine,map){
  var out={d:[],c:{}}, keys=Object.keys(map), i, k;
  var idx={};
  for(k=0;k<keys.length;k++){
    var m={}, arr=map[keys[k]]||[];
    for(i=0;i<arr.length;i++)m[arr[i].d]=arr[i].c;
    idx[keys[k]]=m;
    out.c[keys[k]]=[];
  }
  for(i=0;i<spine.length;i++){
    out.d.push(spine[i].d);
    for(k=0;k<keys.length;k++){
      var v=idx[keys[k]][spine[i].d];
      out.c[keys[k]].push(v>0?v:null);
    }
  }
  return out;
}

/* ผลตอบแทน d วันย้อนหลัง ณ ตำแหน่ง i — คืน null ถ้าข้อมูลไม่ครบ */
function retAt(c,i,d){
  if(i-d<0)return null;
  var a=c[i-d], b=c[i];
  if(a==null||b==null||!(a>0))return null;
  return (b/a-1)*100;
}
/* ค่าเฉลี่ยเคลื่อนที่ ณ ตำแหน่ง i โดยข้ามค่าที่หายไป
   ต้องมีข้อมูลจริงอย่างน้อย 80% ของหน้าต่าง ไม่งั้นคืน null */
function smaAt(c,i,n){
  if(i-n+1<0)return null;
  var s=0,k=0;
  for(var j=i-n+1;j<=i;j++){ if(c[j]!=null){s+=c[j];k++} }
  return k>=n*0.8?s/k:null;
}

/* อันดับเปอร์เซ็นไทล์ของค่าล่าสุด เทียบกับ "หน้าต่างย้อนหลังเท่านั้น"
   ห้ามใช้ข้อมูลทั้งชุดมาคิด เพราะค่าในอดีตจะถูกจัดอันดับโดยรู้อนาคต
   ทำให้กราฟย้อนหลังดูแม่นเกินจริง */
function pctRankAt(arr,i,win,minN){
  if(minN==null)minN=120;           /* ต่ำกว่าครึ่งปี ไม่จัดอันดับ */
  if(i<0||i>=arr.length)return null;
  var v=arr[i];
  if(v==null||!isFinite(v))return null;
  var from=Math.max(0,i-win+1), n=0, le=0;
  for(var j=from;j<=i;j++){
    var x=arr[j];
    if(x==null||!isFinite(x))continue;
    n++; if(x<v)le++; else if(x===v)le+=0.5;
  }
  if(n<minN)return null;            /* ตัวอย่างน้อยเกินกว่าจะจัดอันดับให้มีความหมาย */
  return le/n*100;
}
/* จำนวนวันที่ถูกใช้จัดอันดับจริง ณ ตำแหน่ง i — เอาไว้บอกผู้ใช้ว่าฐานยาวแค่ไหน */
function pctRankN(arr,i,win){
  if(i<0||i>=arr.length)return 0;
  var from=Math.max(0,i-win+1), n=0;
  for(var j=from;j<=i;j++)if(arr[j]!=null&&isFinite(arr[j]))n++;
  return n;
}

root.SCANENG.alignAll=alignAll;
root.SCANENG.retAt=retAt;
root.SCANENG.smaAt=smaAt;
root.SCANENG.pctRankAt=pctRankAt;
root.SCANENG.pctRankN=pctRankN;

/* ==================================================================
   เครื่องทดสอบกลยุทธ์ — ยกมาจากหน้า bot.html แบบคำต่อคำ
   เพื่อให้หน้า Bot Lab ใช้ตรรกะชุดเดียวกันเป๊ะ
   ไม่แยกเป็นสองชุดที่ค่อยๆ เพี้ยนจากกันโดยไม่มีใครรู้
   กติกาเดิมที่ต้องรักษาไว้: สัญญาณเกิดที่แท่ง i แต่สั่งที่ราคาเปิดของแท่ง i+1
   ================================================================== */
function btSma(a,n,i){ if(i<n-1)return null; let s=0; for(let k=i-n+1;k<=i;k++)s+=a[k]; return s/n; }

function rsiSeries(c,p){
  const out=new Array(c.length).fill(null);
  if(c.length<p+1)return out;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=c[i]-c[i-1];if(d>=0)g+=d;else l-=d}
  let ag=g/p,al=l/p;
  out[p]=al===0?100:100-100/(1+ag/al);
  for(let i=p+1;i<c.length;i++){
    const d=c[i]-c[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p;
    out[i]=al===0?100:100-100/(1+ag/al);
  }
  return out;
}

/* bars = [{d,o,h,l,c}] เรียงเก่า -> ใหม่ */

function backtest(bars,P){
  const cost=(P.feePct||0)/100, slip=(P.slipPct||0)/100;
  const c=bars.map(b=>b.c);
  const rsi=P.useRsi?rsiSeries(c,P.rsiLen||14):null;
  const cap0=P.capital||10000;
  let cash=cap0, pos=0, entry=0, entryIdx=-1;
  const trades=[], equity=[];
  let peak=cap0, mdd=0, maxDDpct=0;

  for(let i=0;i<bars.length;i++){
    const px=bars[i].c;
    const eq=cash+pos*px;
    equity.push({d:bars[i].d,v:eq});
    if(eq>peak)peak=eq;
    const dd=eq-peak; if(dd<mdd)mdd=dd;
    const ddp=peak?dd/peak*100:0; if(ddp<maxDDpct)maxDDpct=ddp;

    /* --- ตรวจ stop / target ด้วยราคาสูง-ต่ำของแท่งนี้ (สัญญาณจากไม้ที่เปิดไว้แล้ว) --- */
    if(pos>0){
      let exitPx=null,reason='';
      if(P.stopPct>0){
        const s=entry*(1-P.stopPct/100);
        if(bars[i].l<=s){exitPx=s;reason='stop'}
      }
      if(exitPx===null&&P.takePct>0){
        const t=entry*(1+P.takePct/100);
        if(bars[i].h>=t){exitPx=t;reason='target'}
      }
      if(exitPx!==null){
        const fill=exitPx*(1-slip);
        const proceeds=pos*fill*(1-cost);
        trades.push({din:bars[entryIdx].d,dout:bars[i].d,entry,exit:fill,qty:pos,
          pl:proceeds-pos*entry,reason});
        cash+=proceeds; pos=0; entry=0; entryIdx=-1;
      }
    }

    /* --- สัญญาณจากแท่ง i ใช้สั่งที่แท่ง i+1 --- */
    if(i+1>=bars.length)continue;
    const fast=btSma(c,P.fast,i), slow=btSma(c,P.slow,i);
    const fastP=btSma(c,P.fast,i-1), slowP=btSma(c,P.slow,i-1);
    if(fast==null||slow==null||fastP==null||slowP==null)continue;
    const crossUp=fastP<=slowP&&fast>slow;
    const crossDn=fastP>=slowP&&fast<slow;
    const rsiOk=!P.useRsi||(rsi[i]!=null&&rsi[i]<(P.rsiMax||70));
    const nextOpen=bars[i+1].o;

    if(pos===0&&crossUp&&rsiOk){
      const fill=nextOpen*(1+slip);
      const spend=cash*((P.riskPct||100)/100);
      const qty=fill>0?(spend*(1-cost))/fill:0;
      if(qty>0){ pos=qty; entry=fill; entryIdx=i+1; cash-=spend; }
    } else if(pos>0&&crossDn){
      const fill=nextOpen*(1-slip);
      const proceeds=pos*fill*(1-cost);
      trades.push({din:bars[entryIdx].d,dout:bars[i+1].d,entry,exit:fill,qty:pos,
        pl:proceeds-pos*entry,reason:'signal'});
      cash+=proceeds; pos=0; entry=0; entryIdx=-1;
    }
  }
  /* ปิดสถานะที่ค้างอยู่ที่แท่งสุดท้าย เพื่อให้ตัวเลขจบจริง */
  if(pos>0){
    const last=bars[bars.length-1];
    const fill=last.c*(1-slip), proceeds=pos*fill*(1-cost);
    trades.push({din:bars[entryIdx].d,dout:last.d,entry,exit:fill,qty:pos,
      pl:proceeds-pos*entry,reason:'end'});
    cash+=proceeds; pos=0;
  }
  const final=cash;
  const bhQty=bars.length?cap0*(1-cost)/(bars[0].c*(1+slip)):0;
  const bhFinal=bars.length?bhQty*bars[bars.length-1].c*(1-slip)*(1-cost):cap0;
  const years=bars.length/252;
  const cagr=(v)=>years>0&&cap0>0&&v>0?(Math.pow(v/cap0,1/years)-1)*100:null;
  const wins=trades.filter(t=>t.pl>0), losses=trades.filter(t=>t.pl<0);
  const gw=wins.reduce((a,b)=>a+b.pl,0), gl=Math.abs(losses.reduce((a,b)=>a+b.pl,0));
  return {
    trades,equity,final,ret:(final-cap0)/cap0*100,cagr:cagr(final),
    bhFinal,bhRet:(bhFinal-cap0)/cap0*100,bhCagr:cagr(bhFinal),
    edge:(final-bhFinal)/cap0*100,
    n:trades.length,wins:wins.length,losses:losses.length,
    winRate:trades.length?wins.length/trades.length*100:0,
    profitFactor:gl?gw/gl:(gw>0?Infinity:0),
    avgWin:wins.length?gw/wins.length:0, avgLoss:losses.length?gl/losses.length:0,
    maxDD:mdd,maxDDpct,bars:bars.length,years,
  };
}


function splitBars(bars,isFrac){
  const k=Math.floor(bars.length*(isFrac==null?0.6:isFrac));
  return {IS:bars.slice(0,k),OOS:bars.slice(k)};
}



/* ==================================================================
   แบ่งสภาวะตลาดรายวัน
   สำคัญ: ตัดสินจากข้อมูลที่มีถึงวันนั้นเท่านั้น
   ถ้าใช้ข้อมูลทั้งชุดมาตัดสินว่าช่วงไหนเป็นขาขึ้น เท่ากับรู้อนาคต
   แล้วข้อสรุปว่า "กลยุทธ์นี้เก่งในขาขึ้น" จะใช้ไม่ได้จริง
   เพราะตอนอยู่ในสถานการณ์จริง เราไม่รู้ว่ากำลังอยู่ในขาขึ้นหรือเปล่า
   ================================================================== */
function regimes(bars,opt){
  opt=opt||{};
  var maLen=opt.maLen||200, slopeBack=opt.slopeBack||21,
      volLen=opt.volLen||20, volWin=opt.volWin||252;
  var n=bars.length, c=bars.map(function(b){return b.c});
  var ret=new Array(n).fill(null), i, j;
  for(i=1;i<n;i++)if(c[i-1]>0)ret[i]=c[i]/c[i-1]-1;
  var rv=new Array(n).fill(null);
  for(i=volLen;i<n;i++){
    var s=0,k=0;
    for(j=i-volLen+1;j<=i;j++)if(ret[j]!=null){s+=ret[j]*ret[j];k++}
    if(k>=volLen*0.8)rv[i]=Math.sqrt(s/k);
  }
  var out=new Array(n).fill(null);
  for(i=0;i<n;i++){
    var ma=btSma(c,maLen,i), maPrev=(i-slopeBack>=0)?btSma(c,maLen,i-slopeBack):null;
    if(ma==null||maPrev==null||rv[i]==null){ out[i]=null; continue }
    var up=c[i]>ma&&ma>maPrev;
    var dn=c[i]<ma&&ma<maPrev;
    var trend=up?'ขาขึ้น':dn?'ขาลง':'ออกข้าง';
    /* ผันผวนสูงหรือต่ำ เทียบกับค่ากลางของตัวเองย้อนหลัง ไม่ใช่ตัวเลขตายตัว
       เพราะทองกับหุ้นมีระดับความผันผวนปกติไม่เท่ากัน */
    var from=Math.max(0,i-volWin+1), hist=[];
    for(j=from;j<=i;j++)if(rv[j]!=null)hist.push(rv[j]);
    if(hist.length<60){ out[i]=null; continue }
    hist.sort(function(a,b){return a-b});
    var med=hist[Math.floor(hist.length/2)];
    var vol=rv[i]>med?'ผันผวนสูง':'ผันผวนต่ำ';
    out[i]={trend:trend, vol:vol, key:trend+' · '+vol, rv:rv[i], med:med};
  }
  return out;
}

/* จับคู่ไม้กับสภาวะตลาด "ณ วันที่เข้า" แล้วสรุปสถิติแยกกลุ่ม */
function statsByRegime(bars,trades,reg,by){
  by=by||'key';
  var idx={};
  bars.forEach(function(b,i){ if(idx[b.d]==null)idx[b.d]=i });
  var g={};
  trades.forEach(function(t){
    var i=idx[t.din];
    var r=(i!=null&&reg[i])?reg[i][by]:null;
    var k=r||'ไม่รู้สภาวะ';
    if(!g[k])g[k]={key:k,n:0,win:0,loss:0,gw:0,gl:0,pl:0,rets:[]};
    var inv=t.qty*t.entry;
    var rr=inv>0?t.pl/inv:0;
    g[k].n++; g[k].pl+=t.pl; g[k].rets.push(rr);
    if(t.pl>0){g[k].win++;g[k].gw+=t.pl} else if(t.pl<0){g[k].loss++;g[k].gl+=-t.pl}
  });
  return Object.keys(g).map(function(k){
    var x=g[k];
    x.winRate=(x.win+x.loss)?x.win/(x.win+x.loss)*100:null;
    x.pf=x.gl>0?x.gw/x.gl:null;
    x.avgRet=x.rets.length?x.rets.reduce(function(a,b){return a+b},0)/x.rets.length*100:null;
    return x;
  }).sort(function(a,b){return b.pl-a.pl});
}

/* นับว่าแต่ละสภาวะกินเวลากี่วัน เพื่อบอกว่าชุดข้อมูลนี้เจอสภาวะไหนมากน้อย */
function regimeDays(reg,by){
  by=by||'key';
  var d={},known=0;
  reg.forEach(function(r){ if(!r)return; known++; d[r[by]]=(d[r[by]]||0)+1 });
  return {counts:d,known:known,total:reg.length};
}

/* ==================================================================
   ศึกษาขนาดการลงทุน
   เล่นไม้ชุดเดิมซ้ำ แต่ลงเงินแต่ละไม้เป็นสัดส่วน f ของทุนที่มีตอนนั้น
   ใช้ได้กับกลยุทธ์ที่ถือทีละไม้เท่านั้น
   ================================================================== */
function sizeStudy(trades,fracs){
  var rets=trades.map(function(t){
    var inv=t.qty*t.entry;
    return inv>0?t.pl/inv:0;
  });
  return fracs.map(function(f){
    var eq=1,peak=1,dd=0,wiped=false;
    var curve=[1];
    for(var i=0;i<rets.length;i++){
      var g=1+f*rets[i];
      if(g<=0){ wiped=true; eq=0; curve.push(0); dd=100; break }
      eq*=g; curve.push(eq);
      if(eq>peak)peak=eq;
      var d=(peak-eq)/peak*100;
      if(d>dd)dd=d;
    }
    return {f:f,mult:eq,ret:(eq-1)*100,maxDD:dd,curve:curve,wiped:wiped};
  });
}

root.SCANENG.btSma=btSma;
root.SCANENG.rsiSeries=rsiSeries;
root.SCANENG.backtest=backtest;
root.SCANENG.splitBars=splitBars;
root.SCANENG.regimes=regimes;
root.SCANENG.statsByRegime=statsByRegime;
root.SCANENG.regimeDays=regimeDays;
root.SCANENG.sizeStudy=sizeStudy;


})(typeof globalThis!=='undefined'?globalThis:this);
