/* ==================================================================
   f13.mjs — ดึงรายงาน 13F จาก SEC EDGAR → f13.json
   v2 (12 พ.ย. 2026): จัดอันดับผู้จัดการตาม "ผลตอบแทนต่อปีจาก 13F"
   และสรุปว่าไตรมาสล่าสุด ซื้อใหม่ / เพิ่ม / ลด / ขายหมด อะไร

   ผลตอบแทนจาก 13F คำนวณยังไง
   - 13F ของแต่ละไตรมาสมี มูลค่า และ จำนวนหุ้น ต่อหลักทรัพย์ (CUSIP)
     → ราคา ณ สิ้นไตรมาส = มูลค่า ÷ จำนวนหุ้น (ไม่ต้องใช้แหล่งราคาภายนอก)
   - ผลตอบแทนไตรมาส = Σ น้ำหนักต้นไตรมาส × (ราคาปลายไตรมาส ÷ ราคาต้นไตรมาส − 1)
     ถ้าขายหมดระหว่างไตรมาส ใช้ราคาปลายไตรมาสจากผู้จัดการคนอื่นที่ถือตัวเดียวกัน
     หาไม่ได้ → ตัดทิ้งแล้วถ่วงน้ำหนักใหม่ (ต้องครอบคลุม ≥ 60% ของพอร์ต ไม่งั้นไม่นับไตรมาสนั้น)
   - ต่อปี = (Π(1+r))^(4/จำนวนไตรมาส) − 1 · ใช้เฉพาะรายงานตั้งแต่ 2023-03-31 (หน่วยดอลลาร์เต็ม)
   ข้อจำกัด: ไม่รวมซื้อขายระหว่างไตรมาส เงินสด ชอร์ต ออปชัน หุ้นนอกสหรัฐฯ ค่าธรรมเนียม
   → ไม่เท่ากับผลตอบแทนจริงของกองทุน ใช้เทียบอันดับกันเองเท่านั้น

   ต้องเข้าถึง data.sec.gov และ www.sec.gov ได้ (SEC บล็อกไอพีของ GitHub Actions)
   ================================================================== */
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const OUT=process.env.F13_OUT||join(HERE,'..','f13.json');
/* SEC ขอให้ระบุผู้ติดต่อใน User-Agent · ใช้อีเมล noreply ของ GitHub ไม่ใช้อีเมลส่วนตัว */
const UA='trading-dashboard mekysk@users.noreply.github.com';
const GAP=Number(process.env.F13_GAP_MS||250);
const TOPN=Number(process.env.F13_TOP||25);
const NQ=Number(process.env.F13_QUARTERS||13);        /* 13 รายงาน = 12 ไตรมาส = 3 ปี */
const FROM='2023-03-31';

/* k = คำที่ต้องเจอในชื่อผู้ยื่น — กัน CIK ผิดตัว */
const MGR=[
  ['0001067983','Berkshire Hathaway','Warren Buffett','BERKSHIRE'],
  ['0001649339','Scion Asset Management','Michael Burry','SCION'],
  ['0001336528','Pershing Square','Bill Ackman','PERSHING'],
  ['0001656456','Appaloosa','David Tepper','APPALOOSA'],
  ['0001061768','Baupost Group','Seth Klarman','BAUPOST'],
  ['0001536411','Duquesne Family Office','Stanley Druckenmiller','DUQUESNE'],
  ['0001167483','Tiger Global','Chase Coleman','TIGER'],
  ['0001350694','Bridgewater Associates','Ray Dalio','BRIDGEWATER'],
  ['0001709323','Himalaya Capital','Li Lu','HIMALAYA'],
  ['0001549575','Dalal Street (Pabrai Funds)','Mohnish Pabrai','DALAL'],
  ['0001112520','Akre Capital','Chuck Akre','AKRE'],
  ['0001569205','Fundsmith','Terry Smith','FUNDSMITH'],
  ['0001079114','Greenlight Capital','David Einhorn','GREENLIGHT'],
  ['0001040273','Third Point','Dan Loeb','THIRD POINT'],
  ['0001061165','Lone Pine Capital','Stephen Mandel','LONE PINE'],
  ['0001103804','Viking Global','Andreas Halvorsen','VIKING'],
  ['0001135730','Coatue Management','Philippe Laffont','COATUE'],
  ['0001541617','Altimeter Capital','Brad Gerstner','ALTIMETER'],
  ['0000949509','Oaktree Capital','Howard Marks','OAKTREE'],
  ['0000921669','Icahn Carl C','Carl Icahn','ICAHN'],
  ['0001418814','ValueAct','ValueAct','VALUEACT'],
  ['0001029160','Soros Fund Management','George Soros','SOROS'],
  ['0001034524','Polen Capital','Polen','POLEN'],
  ['0001765224','Valley Forge Capital','Dev Kantesaria','VALLEY FORGE']
].map(([cik,nm,who,k])=>({cik,nm,who,k}));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let last=0;
async function get(url,asJson){
  const wait=GAP-(Date.now()-last); if(wait>0)await sleep(wait); last=Date.now();
  for(let a=0;a<3;a++){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),25000);
      const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':UA,'Accept-Encoding':'gzip'}});
      clearTimeout(t);
      if(r.status===429||r.status>=500)throw new Error('HTTP '+r.status);
      if(!r.ok)return {__status:r.status};
      return asJson?await r.json():await r.text();
    }catch(e){ if(a===2)throw e; await sleep(1500*(a+1)) }
  }
}
const bad=x=>!x||x.__status;
const tag=(x,t)=>{const m=x.match(new RegExp('<(?:\\w+:)?'+t+'[^>]*>([\\s\\S]*?)</(?:\\w+:)?'+t+'>','i'));return m?m[1].trim():null};
const days=(a,b)=>(Date.parse(b)-Date.parse(a))/864e5;

/* อ่านตารางรายการถือของการยื่น 1 ครั้ง → {cusip:{nm,val,sh,opt}} */
async function holdings(cik,acc){
  const accN=acc.replace(/-/g,'');
  const base='https://www.sec.gov/Archives/edgar/data/'+String(Number(cik))+'/'+accN+'/';
  const idx=await get(base+'index.json',true);
  if(bad(idx))return null;
  const xmls=idx.directory.item.filter(x=>/\.xml$/i.test(x.name)&&!/primary_doc/i.test(x.name));
  let body=null;
  for(const x of xmls){ const t=await get(base+x.name); if(!bad(t)&&/informationTable/i.test(t)){body=t;break} }
  if(!body)return null;
  const H={};
  for(const b of body.match(/<(?:\w+:)?infoTable[^>]*>[\s\S]*?<\/(?:\w+:)?infoTable>/gi)||[]){
    const cu=(tag(b,'cusip')||'').toUpperCase(); const nm=tag(b,'nameOfIssuer'); if(!cu||!nm)continue;
    const pc=(tag(b,'putCall')||'').toUpperCase(); const opt=/PUT|CALL/.test(pc)?pc:null;
    const typ=(tag(b,'sshPrnamtType')||'SH').toUpperCase();
    const val=Number((tag(b,'value')||'0').replace(/,/g,'')), sh=Number((tag(b,'sshPrnamt')||'0').replace(/,/g,''));
    const key=cu+(opt?'|'+opt:'');
    if(!H[key])H[key]={cu,nm,cls:tag(b,'titleOfClass'),opt,prn:typ!=='SH',val:0,sh:0};
    H[key].val+=val; H[key].sh+=sh;
  }
  const all=Object.values(H), tv=all.reduce((a,b)=>a+b.val,0), ts=all.reduce((a,b)=>a+b.sh,0);
  if(ts>0&&tv>0&&tv/ts<1.5)all.forEach(x=>x.val*=1000);   /* กันรายงานที่ยังกรอกหลักพัน */
  return {H, url:base};
}

const PRICE={};                               /* PRICE[period][cusip] = ราคาจาก 13F */
async function manager(m){
  const sub=await get('https://data.sec.gov/submissions/CIK'+m.cik+'.json',true);
  if(bad(sub))return {...m,err:'SEC ตอบ '+(sub&&sub.__status||'ไม่ได้')};
  if(!String(sub.name||'').toUpperCase().includes(m.k))return {...m,err:'CIK ไม่ตรงชื่อ ('+sub.name+')'};
  const f=sub.filings.recent, seen=new Set(), F=[];
  for(let i=0;i<f.form.length&&F.length<NQ;i++){
    if(f.form[i]!=='13F-HR')continue;                  /* ข้ามฉบับแก้ไข (/A) ซึ่งมักไม่ครบ */
    const p=f.reportDate[i]; if(!p||p<FROM||seen.has(p))continue;
    seen.add(p); F.push({period:p,filed:f.filingDate[i],acc:f.accessionNumber[i]});
  }
  if(!F.length)return {...m,err:'ไม่มี 13F ตั้งแต่ '+FROM};
  F.sort((a,b)=>a.period.localeCompare(b.period));
  for(const x of F){
    const h=await holdings(m.cik,x.acc); if(!h){x.H=null;continue}
    x.H=h.H; x.url=h.url; PRICE[x.period]=PRICE[x.period]||{};
    for(const r of Object.values(h.H)) if(!r.opt&&!r.prn&&r.sh>0&&!(r.cu in PRICE[x.period])) PRICE[x.period][r.cu]=r.val/r.sh;
  }
  return {...m,F:F.filter(x=>x.H)};
}

function quarterly(F){
  const Q=[];
  for(let i=1;i<F.length;i++){
    const a=F[i-1], b=F[i], gap=days(a.period,b.period); if(gap<60||gap>200)continue;
    const st=Object.values(a.H).filter(r=>!r.opt&&!r.prn&&r.sh>0&&r.val>0);
    const tot=st.reduce((s,r)=>s+r.val,0); if(!tot)continue;
    let cov=0, ret=0;
    for(const r of st){
      const p0=r.val/r.sh, own=b.H[r.cu], p1=own&&own.sh>0&&!own.prn?own.val/own.sh:(PRICE[b.period]||{})[r.cu];
      if(!p1||!isFinite(p1))continue;
      const w=r.val/tot; cov+=w; ret+=w*(p1/p0-1);
    }
    if(cov<0.6)continue;
    Q.push({from:a.period,to:b.period,r:ret/cov,cov:+cov.toFixed(2),nq:Math.max(1,Math.round(gap/91))});
  }
  return Q;
}

function changes(prev,cur){
  const out={neu:[],add:[],cut:[],sold:[]};
  if(!prev||!cur)return out;
  const tot=Object.values(cur.H).reduce((s,r)=>s+r.val,0)||1, ptot=Object.values(prev.H).reduce((s,r)=>s+r.val,0)||1;
  for(const r of Object.values(cur.H)){ if(r.opt)continue;
    const p=prev.H[r.cu], it={nm:r.nm,val:Math.round(r.val),pct:+(r.val/tot*100).toFixed(2)};
    if(!p)out.neu.push(it);
    else if(p.sh>0&&r.sh>p.sh*1.1)out.add.push({...it,chg:+((r.sh/p.sh-1)*100).toFixed(0)});
    else if(p.sh>0&&r.sh<p.sh*0.9)out.cut.push({...it,chg:+((r.sh/p.sh-1)*100).toFixed(0)});
  }
  for(const p of Object.values(prev.H)){ if(p.opt)continue;
    if(!cur.H[p.cu])out.sold.push({nm:p.nm,val:Math.round(p.val),pct:+(p.val/ptot*100).toFixed(2)});
  }
  for(const k in out){ out[k].sort((a,b)=>b.val-a.val); out[k]=out[k].slice(0,10) }
  return out;
}

/* ---------------- main ---------------- */
const raw=[];
for(const m of MGR){
  try{ const r=await manager(m); raw.push(r);
       console.log(r.err?`  ${m.nm} — ${r.err}`:`  ${m.nm.padEnd(28)} ${r.F.length} รายงาน`); }
  catch(e){ raw.push({...m,err:String(e.message||e)}); console.log(`  ${m.nm} — ล้มเหลว ${e.message}`) }
}
const rows=raw.map(m=>{
  if(m.err)return {cik:m.cik,nm:m.nm,who:m.who,err:m.err};
  const F=m.F, L=F[F.length-1], P=F[F.length-2];
  const Q=quarterly(F), n=Q.reduce((s,q)=>s+q.nq,0), g=Q.reduce((s,q)=>s*(1+q.r),1);
  const ann=n>=4?Math.pow(g,4/n)-1:null;
  const all=Object.values(L.H).sort((a,b)=>b.val-a.val), total=all.reduce((s,r)=>s+r.val,0);
  return {cik:m.cik,nm:m.nm,who:m.who,form:'13F-HR',period:L.period,filed:L.filed,acc:L.acc,
    lagDays:Math.round(days(L.period,new Date().toISOString().slice(0,10))),
    positions:all.length,total:Math.round(total),unit:'ดอลลาร์',url:L.url,
    ann:ann==null?null:+(ann*100).toFixed(1), quarters:n, coverage:Q.length?+(Q.reduce((s,q)=>s+q.cov,0)/Q.length).toFixed(2):null,
    since:Q.length?Q[0].from:null,
    top:all.slice(0,TOPN).map(x=>({nm:x.nm,cls:x.cls,put:x.opt,val:Math.round(x.val),sh:x.sh,pct:total?+(x.val/total*100).toFixed(2):null})),
    chg:changes(P,L), chgFrom:P?P.period:null};
});
rows.sort((a,b)=>(b.ann??-1e9)-(a.ann??-1e9));
const ok=rows.filter(r=>!r.err).length;
const note=join(HERE,'..','f13-status.json');
writeFileSync(note,JSON.stringify({checked:new Date().toISOString(),ok,total:rows.length,
  why:ok?null:(rows[0]&&rows[0].err||'ไม่ทราบสาเหตุ')}));
if(!ok){ console.log('ดึงไม่ได้เลยสักราย — ไม่แตะ f13.json เดิม'); process.exit(0) }
writeFileSync(OUT,JSON.stringify({generated:new Date().toISOString(),
  warn:'13F ยื่นช้าได้ถึง 45 วันหลังสิ้นไตรมาส · ผลตอบแทนคำนวณจากราคาใน 13F เอง ไม่รวมซื้อขายระหว่างไตรมาส เงินสด ชอร์ต ออปชัน — ไม่เท่ากับผลจริงของกองทุน',
  method:'ann = ผลตอบแทนทบต้นต่อปีจากพอร์ตหุ้นใน 13F ตั้งแต่ '+FROM,
  managers:rows}));
console.log(`\nเขียน ${OUT} — สำเร็จ ${ok}/${rows.length} ราย`);
