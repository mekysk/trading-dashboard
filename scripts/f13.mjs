/* ==================================================================
   f13.mjs — ดึงรายงาน 13F ตัวจริงจาก SEC EDGAR แล้วเขียน f13.json

   ทำไมต้องรันฝั่งเซิร์ฟเวอร์: www.sec.gov/Archives ไม่เปิด CORS
   เบราว์เซอร์ยิงตรงไม่ได้ (ทดสอบแล้ว ได้ Failed to fetch)
   ส่วน data.sec.gov/submissions เปิด CORS แต่มีแค่รายการยื่น ไม่มีรายการถือ

   ข้อจำกัดที่ต้องเตือนผู้อ่านทุกครั้ง: 13F ยื่นช้าได้ถึง 45 วันหลังสิ้นไตรมาส
   ของที่เห็นคือภาพ ณ วันสิ้นไตรมาส ไม่ใช่พอร์ตวันนี้ อาจขายไปแล้วทั้งก้อน
   และ 13F ไม่รวมสถานะขายชอร์ต พันธบัตร เงินสด และหุ้นนอกสหรัฐฯ
   ================================================================== */
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const OUT=process.env.F13_OUT||join(HERE,'..','f13.json');
/* SEC ขอให้ระบุผู้ติดต่อใน User-Agent และจำกัดไม่เกิน 10 คำขอต่อวินาที */
const UA=process.env.F13_UA||'mekysk trading-dashboard mekysk@users.noreply.github.com';
const GAP=Number(process.env.F13_GAP_MS||350);
const TOPN=Number(process.env.F13_TOP||25);

const MGR=[
  {cik:'0001067983', nm:'Berkshire Hathaway',       who:'Warren Buffett'},
  {cik:'0001649339', nm:'Scion Asset Management',   who:'Michael Burry'},
  {cik:'0001336528', nm:'Pershing Square',          who:'Bill Ackman'},
  {cik:'0001656456', nm:'Appaloosa',                who:'David Tepper'},
  {cik:'0001061768', nm:'Baupost Group',            who:'Seth Klarman'},
  {cik:'0001536411', nm:'Duquesne Family Office',   who:'Stanley Druckenmiller'},
  {cik:'0001167483', nm:'Tiger Global',             who:'Chase Coleman'},
  {cik:'0001350694', nm:'Bridgewater Associates',   who:'Ray Dalio'}
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let last=0;
async function get(url,asJson){
  const wait=GAP-(Date.now()-last);
  if(wait>0)await sleep(wait);
  last=Date.now();
  for(let a=0;a<3;a++){
    try{
      const ctl=new AbortController();
      const t=setTimeout(()=>ctl.abort(),20000);
            const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':UA,'Accept':'application/json, text/html, application/xml;q=0.9, */*;q=0.8','Accept-Language':'en-US,en;q=0.9','Accept-Encoding':'gzip, deflate','Referer':'https://www.sec.gov/'}});
      clearTimeout(t);
      if(r.status===429||r.status>=500)throw new Error('HTTP '+r.status);
            if(!r.ok)return console.log('   SEC ตอบ HTTP '+r.status+' ที่ '+url)||null;
      return asJson?await r.json():await r.text();
    }catch(e){ if(a===2)throw e; await sleep(1500*(a+1)) }
  }
}

const tag=(x,t)=>{
  const m=x.match(new RegExp('<(?:\\w+:)?'+t+'[^>]*>([\\s\\S]*?)</(?:\\w+:)?'+t+'>','i'));
  return m?m[1].trim():null;
};

async function one(m){
  const sub=await get('https://data.sec.gov/submissions/CIK'+m.cik+'.json',true);
  if(!sub)return {...m,err:'ไม่พบข้อมูลผู้ยื่น'};
  const f=sub.filings.recent;
  let i=-1;
  for(let k=0;k<f.form.length;k++)
    if(f.form[k]==='13F-HR'||f.form[k]==='13F-HR/A'){ i=k; break }
  if(i<0)return {...m,err:'ไม่มีการยื่น 13F ในรายการล่าสุด'};

  const acc=f.accessionNumber[i], accN=acc.replace(/-/g,'');
  const base='https://www.sec.gov/Archives/edgar/data/'+String(Number(m.cik))+'/'+accN+'/';
  const idx=await get(base+'index.json',true);
  if(!idx)return {...m,err:'เปิดโฟลเดอร์การยื่นไม่ได้'};

  /* ตารางรายการถือเป็นไฟล์ xml แยก ไม่ใช่ primary_doc
     หาโดยดูเนื้อไฟล์ว่ามี informationTable จริง ไม่เดาจากชื่อ */
  const xmls=idx.directory.item.filter(x=>/\.xml$/i.test(x.name)&&!/primary_doc/i.test(x.name));
  let body=null;
  for(const x of xmls){
    const t=await get(base+x.name);
    if(t&&/informationTable/i.test(t)){ body=t; break }
  }
  if(!body)return {...m,err:'ไม่พบตารางรายการถือในการยื่นนี้'};

  const blocks=body.match(/<(?:\w+:)?infoTable[^>]*>[\s\S]*?<\/(?:\w+:)?infoTable>/gi)||[];
  const byName={};
  for(const b of blocks){
    const nm=tag(b,'nameOfIssuer'), cls=tag(b,'titleOfClass');
    const val=Number((tag(b,'value')||'0').replace(/,/g,''));
    const sh=Number((tag(b,'sshPrnamt')||'0').replace(/,/g,''));
    const put=/\b(PUT|CALL)\b/i.test(tag(b,'putCall')||'')?(tag(b,'putCall')||'').toUpperCase():null;
    if(!nm)continue;
    const key=nm+'|'+(put||cls||'');
    if(!byName[key])byName[key]={nm,cls,put,val:0,sh:0};
    byName[key].val+=val; byName[key].sh+=sh;
  }
  const all=Object.values(byName);
  /* ปี 2022 ขึ้นมา SEC ให้กรอกมูลค่าเป็นดอลลาร์เต็ม ก่อนนั้นเป็นหลักพันดอลลาร์
     ถ้าไม่แยกกรณี ยอดรวมจะผิดพันเท่า จึงเดาจากขนาดยอดรวมเทียบจำนวนหุ้น */
  let total=all.reduce((a,b)=>a+b.val,0);
  const shares=all.reduce((a,b)=>a+b.sh,0);
  let unit='ดอลลาร์';
  if(shares>0&&total>0&&total/shares<1.5){ total*=1000; all.forEach(x=>x.val*=1000); unit='พันดอลลาร์ (แปลงแล้ว)' }
  all.sort((a,b)=>b.val-a.val);
  const top=all.slice(0,TOPN).map(x=>({nm:x.nm,cls:x.cls,put:x.put,
    val:Math.round(x.val), sh:x.sh,
    pct:total>0?+(x.val/total*100).toFixed(2):null}));

  const period=f.reportDate[i], filed=f.filingDate[i];
  const lag=Math.round((Date.now()-Date.parse(period+'T00:00:00Z'))/86400000);
  return {...m, form:f.form[i], period, filed, acc, lagDays:lag,
    positions:all.length, total:Math.round(total), unit, top,
    url:'https://www.sec.gov/Archives/edgar/data/'+String(Number(m.cik))+'/'+accN+'/'};
}

const rows=[];
for(const m of MGR){
  try{ const r=await one(m); rows.push(r);
       console.log(r.err?`  ${m.nm} — ${r.err}`
         :`  ${m.nm.padEnd(26)} ${r.period} (ยื่น ${r.filed}, ช้า ${r.lagDays} วัน) ${r.positions} รายการ`);
  }catch(e){ rows.push({...m,err:String(e.message||e)}); console.log(`  ${m.nm} — ล้มเหลว ${e.message}`) }
}
const ok=rows.filter(r=>!r.err).length;
if(!ok){ console.error('ดึงไม่ได้เลยสักราย — ไม่เขียนทับไฟล์เดิม'); process.exit(1) }
writeFileSync(OUT,JSON.stringify({generated:new Date().toISOString(),
  warn:'13F ยื่นช้าได้ถึง 45 วันหลังสิ้นไตรมาส และไม่รวมชอร์ต พันธบัตร เงินสด หุ้นนอกสหรัฐฯ',
  managers:rows}));
console.log(`\nเขียน ${OUT} — สำเร็จ ${ok}/${rows.length} ราย`);
