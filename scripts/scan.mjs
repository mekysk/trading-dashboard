/* ==================================================================
   scan.mjs — สแกนหุ้นทั้งยูนิเวิร์ส แล้วเขียน scan.json
   รันบน GitHub Actions ตอนกลางคืน (Node 20+ ไม่ต้องลงไลบรารีเพิ่ม)

   รันเองบนเครื่องก็ได้:  node scripts/scan.mjs
   ================================================================== */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=join(HERE,'..');
const OUT=process.env.SCAN_OUT||join(ROOT,'scan.json');
const WORKERS=Number(process.env.SCAN_WORKERS||8);
const RETRY=2;

/* ---- งบเวลา ----
   รอบ 2026-10-04 ถูก GitHub ตัดทิ้งตอนครบ 30 นาทีพอดี คือสแกนไม่เสร็จในเวลา
   ปัญหาคือ "ถูกฆ่ากลางทาง" แปลว่าไม่มีทั้งไฟล์ใหม่และคำอธิบายว่าติดที่ไหน
   จึงตั้งเส้นตายของสคริปต์เองให้สั้นกว่าเพดานของ GitHub
   พอหมดเวลา เลิกหยิบตัวใหม่ แล้วเดินไปด่านตรวจตามปกติ
   ถ้าได้ไม่ถึงเกณฑ์ ด่านตรวจจะไม่เขียนทับและบอกเหตุผลออกมาในล็อก */
const DEADLINE_MS=Number(process.env.SCAN_DEADLINE_MIN||20)*60000;
const REQ_MS=Number(process.env.SCAN_REQ_MS||12000);     /* เดิม 20000 */
const SYM_MS=Number(process.env.SCAN_SYM_MS||26000);     /* เพดานรวมต่อหุ้นหนึ่งตัว */
const T_START=Date.now();
const left=()=>DEADLINE_MS-(Date.now()-T_START);
const STAT={ok:0,timeout:0,rate:0,http:0,short:0,other:0,ms:0};

/* โหลดเครื่องคำนวณตัวเดียวกับที่หน้าเว็บใช้ */
const engPath=[join(ROOT,'engine.js'),join(ROOT,'UPLOAD-ME','engine.js'),
               join(HERE,'engine.js')].find(p=>existsSync(p));
if(!engPath){ console.error('หา engine.js ไม่เจอ'); process.exit(1); }
new Function(readFileSync(engPath,'utf8'))();
const E=globalThis.SCANENG;

/* อ่านรายชื่อพร้อมกลุ่มอุตสาหกรรม
   บรรทัด "#@ ชื่อกลุ่ม" ทำหน้าที่เป็นหัวข้อ หุ้นใต้บรรทัดนั้นถูกติดกลุ่มนี้ */
const uniPath=join(HERE,'universe.txt');
const SEC={}; const SYMS=[];
let curSec=null;
for(const raw of readFileSync(uniPath,'utf8').split('\n')){
  const line=raw.trim();
  if(line.startsWith('#@')){ curSec=line.slice(2).trim()||null; continue }
  if(line.startsWith('#')||!line)continue;
  for(const tok of line.split(/\s+/)){
    const t=tok.trim().toUpperCase();
    if(!/^[A-Z][A-Z.0-9]{0,5}$/.test(t))continue;
    SYMS.push(t);
    if(SEC[t]==null)SEC[t]=curSec;     /* ถ้าโผล่ซ้ำ ยึดกลุ่มแรกที่เจอ */
  }
}
const UNIQ=[...new Set(SYMS)];
const SECLIST=[...new Set(Object.values(SEC).filter(Boolean))];

async function getCsv(sym){
  const url='https://stooq.com/q/d/l/?s='+E.stooqSym(sym)+'&i=d';
  const budget=Date.now()+SYM_MS;
  for(let a=0;a<=RETRY;a++){
    /* เวลาที่เหลือของหุ้นตัวนี้ และของงานทั้งก้อน อะไรหมดก่อนใช้อันนั้น */
    const ms=Math.min(REQ_MS,budget-Date.now(),left());
    if(ms<1500)throw new Error('หมดเวลา');
    try{
      const ctl=new AbortController();
      const t=setTimeout(()=>ctl.abort(),ms);
      const r=await fetch(url,{signal:ctl.signal,
        headers:{'User-Agent':'Mozilla/5.0 (scan.mjs)'}});
      clearTimeout(t);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const txt=await r.text();
      if(/exceeded|limit/i.test(txt.slice(0,200)))throw new Error('โดนจำกัดอัตราการดึง');
      if(!/^\s*Date/i.test(txt))throw new Error('ไม่ใช่ไฟล์ CSV ที่คาดไว้');
      const bars=E.parseCsv(txt);
      if(!bars)throw new Error('ข้อมูลย้อนหลังน้อยกว่า 60 วัน');
      return bars;
    }catch(e){
      const m=String(e&&(e.message||e.name)||e);
      if(a===RETRY||/หมดเวลา/.test(m))throw e;
      /* รอถอยหลังสั้นลงจากเดิม 1200ms เพราะงบเวลาทั้งก้อนมีจำกัด */
      const back=Math.min(700*(a+1),Math.max(0,budget-Date.now()-1500));
      if(back<=0)throw e;
      await new Promise(r=>setTimeout(r,back));
    }
  }
}

const done=[],failed=[];
const BRE={};              /* ตัวนับความกว้างตลาด แยกตามวันที่ */
const BDAYS=Number(process.env.SCAN_BREADTH_DAYS||252);

/* นับหุ้นหนึ่งตัวเข้าสถิติรายวัน ย้อนหลัง BDAYS วันทำการ
   ทุกตัวเลขคิดจากข้อมูลที่มีถึงวันนั้นเท่านั้น ไม่ย้อนกลับไปแก้ */
function addBreadth(bars){
  const n=bars.length;
  if(n<210)return;                       /* สั้นเกินกว่าจะรู้ MA200 หรือกรอบ 52 สัปดาห์ */
  const c=bars.map(b=>b.c), h=bars.map(b=>b.h), lo=bars.map(b=>b.l);
  /* ผลรวมสะสมไว้หา MA เร็วๆ */
  const cum=new Array(n+1).fill(0);
  for(let i=0;i<n;i++)cum[i+1]=cum[i]+c[i];
  const ma=(i,w)=> i-w+1<0 ? null : (cum[i+1]-cum[i+1-w])/w;
  const from=Math.max(252,n-BDAYS);      /* ต้องมีประวัติ 252 วันก่อนจึงเริ่มนับ */
  for(let i=from;i<n;i++){
    const d=bars[i].d;
    let b=BRE[d];
    if(!b)b=BRE[d]={n:0,adv:0,dec:0,unch:0,a50:0,a50n:0,a200:0,a200n:0,
                    nh:0,nl:0,up4:0,dn4:0};
    b.n++;
    const prev=c[i-1];
    if(prev>0){
      const ch=(c[i]/prev-1)*100;
      if(ch>0.0001)b.adv++; else if(ch<-0.0001)b.dec++; else b.unch++;
      if(ch>=4)b.up4++; else if(ch<=-4)b.dn4++;
    }else b.unch++;
    const m50=ma(i,50), m200=ma(i,200);
    if(m50!=null){ b.a50n++; if(c[i]>m50)b.a50++ }
    if(m200!=null){ b.a200n++; if(c[i]>m200)b.a200++ }
    /* นิวไฮ/นิวโลว์ 52 สัปดาห์ เทียบกับ 252 วันก่อนหน้า ไม่รวมวันนี้ */
    let hh=-Infinity, ll=Infinity;
    for(let j=i-252;j<i;j++){ if(h[j]>hh)hh=h[j]; if(lo[j]<ll)ll=lo[j] }
    /* ต้อง "เกิน" ไฮเดิมจริงๆ ถึงนับเป็นนิวไฮ ใช้ >= ไม่ได้
       เพราะหุ้นที่ราคานิ่งสนิทจะเท่ากับทั้งไฮและโลว์เดิม
       แล้วจะถูกนับเป็นทั้งนิวไฮและนิวโลว์ในวันเดียวกัน ซึ่งขัดกันเอง */
    if(isFinite(hh)&&h[i]>hh)b.nh++;
    if(isFinite(ll)&&lo[i]<ll)b.nl++;
  }
}

let idx=0,n=0,quit=false;
async function worker(){
  while(idx<UNIQ.length){
    if(left()<=2000){ quit=true; break }
    const sym=UNIQ[idx++];
    const t1=Date.now();
    try{
      const bars=await getCsv(sym);
      const m=E.metrics(bars);
      if(!m)throw new Error('แท่งราคาน้อยกว่า 60 วัน');
      m.sym=sym;
      done.push(m);
      addBreadth(bars);
      STAT.ok++; STAT.ms+=Date.now()-t1;
    }catch(e){
      const w=String(e&&(e.message||e.name)||e);
      failed.push({sym,why:w});
      if(/abort|หมดเวลา/i.test(w))STAT.timeout++;
      else if(/จำกัดอัตรา/.test(w))STAT.rate++;
      else if(/^HTTP/.test(w))STAT.http++;
      else if(/น้อยกว่า 60/.test(w))STAT.short++;
      else STAT.other++;
    }
    n++;
    if(n%25===0||n===UNIQ.length)
      console.log(`  ${n}/${UNIQ.length}  ok=${done.length} fail=${failed.length}`);
  }
}

console.log(`เริ่มสแกน ${UNIQ.length} สัญลักษณ์ (${WORKERS} สายพร้อมกัน)`);
const t0=Date.now();
await Promise.all(Array.from({length:WORKERS},worker));

const usedMin=((Date.now()-T_START)/60000).toFixed(1);
console.log(`\nใช้เวลา ${usedMin} นาที  ดึงสำเร็จ ${done.length}/${UNIQ.length}`);
console.log(`  เฉลี่ยต่อตัวที่สำเร็จ ${STAT.ok?Math.round(STAT.ms/STAT.ok):0} ms`);
console.log(`  พลาดเพราะ: หมดเวลารอ ${STAT.timeout} · ถูกจำกัดอัตรา ${STAT.rate}`+
            ` · ตอบไม่ใช่ 200 ${STAT.http} · ประวัติสั้น ${STAT.short} · อื่นๆ ${STAT.other}`);
if(quit){
  console.log(`  !! ชนเส้นตาย ${DEADLINE_MS/60000} นาที — ยังเหลือไม่ได้สแกน ${UNIQ.length-n} ตัว`);
  console.log('     ถ้าเจอบ่อย: เพิ่ม timeout-minutes ใน scan.yml และ SCAN_DEADLINE_MIN ให้สูงขึ้น');
  if(STAT.rate>STAT.ok*0.1)console.log('     เห็นการจำกัดอัตราเยอะ ลด SCAN_WORKERS ลงน่าจะเร็วกว่าเพิ่ม');
}

/* ---- ด่านตรวจก่อนเขียนทับ ----
   RS คิดจากการเทียบกันเองทั้งชุด ถ้าชุดไม่ครบ อันดับจะเพี้ยนทั้งกระดาน
   ไฟล์เก่าที่ถูกต้องย่อมดีกว่าไฟล์ใหม่ที่ผิด จึงยอมให้งานล้มเหลวดีกว่าเขียนทับ */
const MIN_RATIO=Number(process.env.SCAN_MIN_RATIO||0.7);
const MIN_RS=Number(process.env.SCAN_MIN_RS||50);
const withRS=done.filter(m=>m.rsRaw!=null).length;

if(!done.length){
  console.error('ดึงข้อมูลไม่ได้เลยสักตัว — ไม่เขียนทับไฟล์เดิม');
  process.exit(1);
}
if(done.length<UNIQ.length*MIN_RATIO){
  console.error(`ดึงได้แค่ ${done.length}/${UNIQ.length} `+
    `(ต่ำกว่าเกณฑ์ ${Math.round(MIN_RATIO*100)}%) — ไม่เขียนทับไฟล์เดิม`);
  console.error('RS คิดจากการเทียบกันทั้งชุด ชุดไม่ครบ = อันดับเพี้ยนทั้งกระดาน');
  process.exit(1);
}
if(withRS<MIN_RS){
  console.error(`มีข้อมูลครบปีแค่ ${withRS} ตัว (ต้องการอย่างน้อย ${MIN_RS}) — ไม่เขียนทับไฟล์เดิม`);
  console.error('จัดอันดับจากกลุ่มเล็กเกินไป เลข RS จะไม่มีความหมาย');
  process.exit(1);
}

E.addRank(done);

/* วันที่ล่าสุดที่หุ้นส่วนใหญ่มีข้อมูล = วันอ้างอิงของชุดนี้ */
const cnt={};
done.forEach(m=>cnt[m.date]=(cnt[m.date]||0)+1);
const asof=Object.keys(cnt).sort().pop();
const stale=done.filter(m=>m.date!==asof).map(m=>m.sym);

const round=(x,d=2)=>x==null||!isFinite(x)?null:Number(x.toFixed(d));
const rows=done.map(m=>({
  s:m.sym, sec:SEC[m.sym]||null, d:m.date, c:round(m.close), b:m.bars, w:m.win,
  rs:m.rs, liq:m.liq,
  c1:round(m.chg1), c5:round(m.chg5), c21:round(m.chg21),
  c63:round(m.chg63), c252:round(m.chg252),
  fh:round(m.fromHigh), al:round(m.aboveLow),
  m50:round(m.ma50), m150:round(m.ma150), m200:round(m.ma200),
  up200:m.ma200up, ttp:m.ttPass, ttk:m.ttKnown, ttf:m.ttFull,
  vs:round(m.volSpike), dv:m.avgDollarVol50==null?null:Math.round(m.avgDollarVol50),
  obv:round(m.obv,3), rsi:round(m.rsi,1),
  pv:round(m.pivot), tp:round(m.toPivot),
  f:{vcp:m.vcp,vdu:m.vdu,ppbp:m.ppbp,np:m.nearPivot,bo:m.breakout,
     os:m.oversold,bc:m.bounce,vd:m.volDry,vu:m.volSurge}
}));
rows.sort((a,b)=>(b.rs??-1)-(a.rs??-1));

/* ---- สรุปความกว้างตลาดเป็นอนุกรมเวลา ----
   ตัดวันที่มีหุ้นรายงานน้อยกว่าครึ่งของวันปกติทิ้ง
   เพราะนั่นคือวันที่ข้อมูลมาไม่ครบ ไม่ใช่วันที่ตลาดเงียบ
   ถ้าปล่อยไว้ เส้น A/D จะมีรอยหยักปลอมๆ */
const bDates=Object.keys(BRE).sort();
const counts=bDates.map(d=>BRE[d].n).sort((a,b)=>a-b);
const medN=counts.length?counts[Math.floor(counts.length/2)]:0;
/* เกณฑ์ 80% ของวันปกติ — ไม่ใช่ 50%
   วันที่หุ้นรายงานมาแค่ 60% ก็เพี้ยนพอที่จะทำให้ A/D ผิดแล้ว
   โดยเฉพาะวันล่าสุดที่ข้อมูลบางตัวมักมาช้ากว่าเพื่อน
   ยอมตัดวันล่าสุดทิ้ง ดีกว่าแสดงความกว้างตลาดที่คำนวณจากหุ้นไม่ครบ */
const MINSHARE=Number(process.env.SCAN_BREADTH_MINSHARE||0.8);
const keep=bDates.filter(d=>BRE[d].n>=medN*MINSHARE);
const dropped=bDates.length-keep.length;
const pick=keep.slice(-BDAYS);
const B={dates:pick, n:[], adv:[], dec:[], unch:[],
  a50:[], a200:[], nh:[], nl:[], up4:[], dn4:[]};
pick.forEach(d=>{
  const b=BRE[d];
  B.n.push(b.n); B.adv.push(b.adv); B.dec.push(b.dec); B.unch.push(b.unch);
  B.a50.push(b.a50n ? +(b.a50/b.a50n*100).toFixed(2) : null);
  B.a200.push(b.a200n ? +(b.a200/b.a200n*100).toFixed(2) : null);
  B.nh.push(b.nh); B.nl.push(b.nl); B.up4.push(b.up4); B.dn4.push(b.dn4);
});

const out={
  generated:new Date().toISOString(),
  asof, universe:UNIQ.length, scanned:done.length,
  withRS:done.filter(m=>m.rs!=null).length,
  staleSymbols:stale, failed, rows,
  sectors:SECLIST,
  noSector:done.filter(m=>!SEC[m.sym]).map(m=>m.sym),
  breadth:B, breadthDropped:dropped, breadthMedianN:medN
};
mkdirSync(dirname(OUT),{recursive:true});
writeFileSync(OUT,JSON.stringify(out));
console.log(`เสร็จใน ${((Date.now()-t0)/1000).toFixed(0)} วินาที`);
console.log(`เขียน ${OUT}  (${(JSON.stringify(out).length/1024).toFixed(0)} KB)`);
console.log(`วันอ้างอิง ${asof} | สแกนได้ ${done.length}/${UNIQ.length} | มี RS ${out.withRS}`);
if(out.noSector.length)
  console.log(`ไม่ได้ติดกลุ่ม ${out.noSector.length} ตัว: ${out.noSector.slice(0,20).join(' ')}`);
else console.log(`ติดกลุ่มครบทุกตัว (${SECLIST.length} กลุ่ม)`);
console.log(`ความกว้างตลาด ${B.dates.length} วัน | หุ้นต่อวันโดยทั่วไป ${medN} ตัว`
  + (dropped?` | ตัดวันที่ข้อมูลมาไม่ครบทิ้ง ${dropped} วัน`:''));
if(stale.length)console.log(`ข้อมูลไม่ทันวันล่าสุด ${stale.length} ตัว: ${stale.slice(0,15).join(' ')}`);
if(failed.length){
  console.log(`ดึงไม่ได้ ${failed.length} ตัว:`);
  failed.slice(0,30).forEach(f=>console.log(`   ${f.sym} — ${f.why}`));
  if(failed.length>30)console.log(`   ...และอีก ${failed.length-30} ตัว`);
}
