/* ==================================================================
   brief.mjs — เขียนบทสรุปข่าวเช้าบนคลาวด์ ไม่ต้องพึ่งพีซี

   ทำไมต้องมีตัวนี้
   ----------------------------------------------------------------
   เดิมบทสรุปข่าวเขียนโดยเอเจนต์ในแอป Claude บนพีซี แล้วต้องรัน
   publish-agents.bat ส่งขึ้นเว็บอีกที  ถ้าพีซีปิดหรือลืมรัน เว็บจะ
   ค้างอยู่กับบทสรุปเก่าโดยไม่มีใครรู้
   เคสจริง: 19 ต.ค. 2026 เปิดเว็บเจอบทสรุปของ 13 ต.ค. เก่าไป 4 วันทำการ
   ตัวนี้ย้ายงานนั้นมาไว้บน GitHub Actions มือถือจึงได้ของสดเสมอ

   กฎความปลอดภัยที่ห้ามละเมิด
   ----------------------------------------------------------------
   สคริปต์นี้ส่งข้อมูลออกไปให้ผู้ให้บริการ AI ภายนอก และชั้นฟรีของ
   Google ระบุว่าอาจนำข้อมูลไปปรับปรุงโมเดล  จึงห้ามส่งอะไรที่เป็น
   ของส่วนตัวออกไปเด็ดขาด
     * ส่งได้เฉพาะหัวข้อข่าวสาธารณะที่ดึงมาจาก RSS เท่านั้น
     * ห้ามอ่าน positions.txt, agent-*.json, นำเข้าพอร์ต*.json
       หรือไฟล์ใดที่มีพอร์ต จำนวนหุ้น ต้นทุน หรือสมุดเทรด
   ข้อห้ามนี้บังคับด้วยโค้ดจริงข้างล่าง (ดู assertNoPrivateData)
   ไม่ใช่แค่เขียนเตือนไว้เฉยๆ เพราะคำเตือนไม่หยุดใครได้

   กุญแจ API อ่านจาก environment ที่ GitHub Secrets ส่งเข้ามา
   มันวิ่งบนเซิร์ฟเวอร์ GitHub ไม่ใช่ในเบราว์เซอร์ จึงไม่โผล่ให้ใครเห็น
   ห้ามเขียนกุญแจลงไฟล์ผลลัพธ์หรือ log ไม่ว่ากรณีใด
   ================================================================== */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT      = 'brief-latest.json';
const STATUS   = 'brief-status.json';
const KEY      = process.env.GEMINI_API_KEY || '';
/* ชื่อรุ่นของ Google เปลี่ยนบ่อยและรุ่นเก่าถูกปิดเป็นระยะ
   ถ้าล็อกชื่อเดียวไว้ วันหนึ่งงานจะล้มด้วย 404 โดยไม่มีสาเหตุที่ชัด
   จึงไล่ลองตามลำดับ แล้วรายงานว่าใช้ตัวไหนจริง
   ตั้ง GEMINI_MODEL ใน Secrets เพื่อบังคับใช้ตัวใดตัวหนึ่งก็ได้

   รอบแรกที่รันจริง ตัวที่ใช้ได้คือ gemini-flash-lite-latest ซึ่งเป็นตัวท้ายสุด
   แปลว่าสามตัวแรกล้มหมด แต่ตอนนั้นไม่ได้เก็บเหตุผลไว้ จึงไม่รู้ว่าล้มเพราะอะไร
   ตอนนี้บันทึกเหตุผลลง brief-status.json แล้ว รอบหน้าจะตอบได้ว่าทำไม
   (gemini 2.0 ถูกปิดไปตั้งแต่ 1 มิ.ย. 2026 จึงเอาออก และใส่รุ่น 3.x ที่ยังเปิดอยู่) */
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest','gemini-3.5-flash','gemini-2.5-flash','gemini-flash-lite-latest'];

/* ---------------------------------------------------------------
   ตัวเลขตลาดจริง อ่านจากไฟล์ราคาใน repo ที่งานสแกนเตรียมไว้
   หัวข้อข่าว RSS ไม่มีตัวเลขติดมา บทสรุปรอบแรกจึงพูดลอยๆ ว่า
   "ดีดตัวขึ้น" โดยไม่มีตัวเลขสักตัว  ป้อนราคาปิดจริงเข้าไปด้วย
   จะได้เขียนอ้างตัวเลขได้ และเราตรวจทานได้ว่าตรงกับของจริงไหม
   ข้อมูลนี้เป็นราคาตลาดสาธารณะ ไม่ใช่ข้อมูลพอร์ต จึงส่งออกได้
   --------------------------------------------------------------- */
const PX = [
  {f:'px/idx-spx.json', n:'S&P 500'}, {f:'px/idx-ndq.json', n:'Nasdaq'},
  {f:'px/idx-dji.json', n:'Dow Jones'}, {f:'px/idx-vix.json', n:'VIX'},
  {f:'px/xauusd.json',  n:'ทองคำ'},    {f:'px/cl.f.json',   n:'น้ำมัน WTI'},
  {f:'px/btcusd.json',  n:'Bitcoin'},   {f:'px/dx.f.json',   n:'ดัชนีดอลลาร์'},
];
function marketNumbers(){
  const out=[];
  for(const {f,n} of PX){
    try{
      if(!existsSync(f))continue;
      const j=JSON.parse(readFileSync(f,'utf8'));
      const c=(j&&j.c)||[], d=(j&&j.d)||[];
      if(c.length<2)continue;
      const last=c[c.length-1], prev=c[c.length-2];
      if(last==null||prev==null||!prev)continue;
      const pct=(last-prev)/prev*100;
      out.push(n+' ปิดที่ '+Number(last).toLocaleString('en-US',
        {maximumFractionDigits:2})+' ('+(pct>=0?'+':'')+pct.toFixed(2)+'%) '
        +'ณ วันที่ '+(d[d.length-1]||'ไม่ระบุ'));
    }catch(e){ /* ไฟล์ไหนอ่านไม่ได้ก็ข้าม ดีกว่าทำให้ทั้งงานล้ม */ }
  }
  return out;
}
const REQ_MS   = Number(process.env.BRIEF_REQ_MS || 20000);
const MAX_ITEM = Number(process.env.BRIEF_MAX_ITEMS || 45);

/* แหล่งข่าวที่เปิด RSS ให้ใช้ฟรี ไม่ต้องใช้กุญแจ
   เลือกหลายแหล่งเพราะแหล่งเดียวล่มแล้วจบ และมุมมองเดียวก็เอียงง่าย */
/* ตรวจแล้วเมื่อ 19 ต.ค. 2026 ว่าแต่ละแหล่งตอบจริงและข่าวสด
   ที่ตัดออกและเหตุผล — อย่าใส่กลับมาโดยไม่ลองใหม่ก่อน
     Yahoo Finance rssindex  ตอบ 404 จากเครื่อง Actions และข่าวล่าสุดค้างอยู่ 24 ก.ย.
     CNBC id 20910213        ตอบ 404 (เดารหัสหมวดผิด)
     Investing crypto 301    ข่าวล่าสุด 27 ก.ย. เก่าเกินกรอง 36 ชม. จึงไม่เหลืออะไร
   รอบแรกที่รันจริงได้ข่าวหุ้นมาเยอะแต่ไม่มีทองกับน้ำมันเลย บทสรุปจึงต้องเขียนว่า
   "ไม่พบข่าวเรื่องนี้ในรอบนี้" ทั้งที่ทองเป็นสินทรัพย์ที่เจ้าของพอร์ตถืออยู่
   จึงเพิ่มหมวดสินค้าโภคภัณฑ์ ค่าเงิน และคริปโตเข้ามาโดยเฉพาะ */
const FEEDS = [
  { name:'CNBC Markets',       url:'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { name:'MarketWatch Top',    url:'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name:'Investing หุ้น',     url:'https://www.investing.com/rss/news_25.rss' },
  { name:'Investing โภคภัณฑ์', url:'https://www.investing.com/rss/news_11.rss' },
  { name:'Investing ค่าเงิน',  url:'https://www.investing.com/rss/news_1.rss' },
  { name:'Investing คริปโต',   url:'https://www.investing.com/rss/news_301.rss' },
  { name:'CoinDesk',           url:'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name:'Federal Reserve',    url:'https://www.federalreserve.gov/feeds/press_all.xml' },
];

const log = (...a)=>console.log(...a);

/* ---------------------------------------------------------------
   ตัวกันข้อมูลส่วนตัวรั่ว
   เรียกก่อนส่งทุกครั้ง  ถ้าเจอร่องรอยพอร์ตให้หยุดทั้งงาน
   ยอมให้งานล้มดีกว่าปล่อยข้อมูลออกไปแล้วเรียกคืนไม่ได้
   --------------------------------------------------------------- */
const BANNED_FILES = ['positions.txt','นำเข้าพอร์ตจากชีต.json','agent-data.json'];
function assertNoPrivateData(text){
  for(const f of BANNED_FILES){
    if(existsSync(f)){
      /* ไฟล์มีอยู่ในเครื่องก็ไม่เป็นไร ขอแค่เนื้อหาที่จะส่งต้องไม่ตรงกับมัน */
      let body=''; try{ body=readFileSync(f,'utf8') }catch(e){}
      const lines=body.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.length>25);
      for(const ln of lines){
        if(text.includes(ln))
          throw new Error('พบข้อความจาก '+f+' ในสิ่งที่กำลังจะส่งออก — หยุดงานทันที');
      }
    }
  }
  /* รูปแบบที่บอกว่าเป็นพอร์ต เช่น "LLY | ถือ | 19.8%" */
  if(/\|\s*(ถือ|เฝ้าดู)\s*\|/.test(text))
    throw new Error('พบรูปแบบรายการพอร์ตในสิ่งที่กำลังจะส่งออก — หยุดงานทันที');
  if(/ต้นทุนรวม|มูลค่าพอร์ต|สมุดเทรด/.test(text))
    throw new Error('พบคำที่บ่งบอกข้อมูลพอร์ตในสิ่งที่กำลังจะส่งออก — หยุดงานทันที');
  return text;
}

/* --------------------------------------------------------------- */
async function get(url,ms){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),ms||REQ_MS);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{
      'User-Agent':'trading-dashboard/1.0 (+https://github.com/mekysk/trading-dashboard)',
      'Accept':'application/rss+xml, application/xml, text/xml, */*'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.text();
  } finally { clearTimeout(t) }
}

/* อ่าน RSS แบบง่าย — ไม่ใช้ไลบรารีภายนอกเพื่อไม่ต้อง npm install
   รองรับทั้ง <item> ของ RSS และ <entry> ของ Atom */
function parseFeed(xml){
  const out=[];
  const blocks=xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi)||[];
  for(const b of blocks){
    const title=pick(b,'title');
    if(!title)continue;
    let link=pick(b,'link');
    if(!link){ const m=b.match(/<link[^>]*href="([^"]+)"/i); if(m)link=m[1] }
    const date=pick(b,'pubDate')||pick(b,'published')||pick(b,'updated')||'';
    out.push({title:clean(title), link:(link||'').trim(), date:date.trim()});
  }
  return out;
}
function pick(block,tag){
  const m=block.match(new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'));
  return m?m[1]:'';
}
function clean(s){
  /* ลำดับสำคัญมาก ต้องลอกแท็ก -> ถอดสัญลักษณ์ -> ลอกแท็กอีกรอบ
     ฟีด Atom ใส่ title type="html" ซึ่งเข้ารหัสแท็กจริงไว้เป็น &lt;b&gt;
     ถ้าลอกแท็กรอบเดียวก่อนถอดสัญลักษณ์ พอถอดเสร็จ <b> จะโผล่กลับมา
     แล้วติดไปกับหัวข้อข่าวที่ส่งให้ AI (เจอตอนทดสอบด้วย Atom จำลอง) */
  const strip=t=>t.replace(/<[^>]+>/g,' ');
  const entity=t=>t
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d))
    .replace(/&amp;/g,'&');          /* &amp; ต้องท้ายสุด ไม่งั้น &amp;lt; จะกลายเป็น < */
  return strip(entity(strip(
    String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  ))).replace(/\s+/g,' ').trim();
}

/* เอาเฉพาะข่าวใหม่ ไม่งั้นบทสรุปจะมีข่าวค้างสัปดาห์ก่อนปนมา */
function isRecent(d,hours){
  if(!d)return true;                      /* ไม่ระบุวันก็ปล่อยผ่าน ดีกว่าทิ้งข่าวจริง */
  const t=Date.parse(d);
  if(isNaN(t))return true;
  return (Date.now()-t) <= hours*3600*1000;
}

async function collect(){
  const seen=new Set(), items=[], ok=[], failed=[];
  for(const f of FEEDS){
    try{
      const xml=await get(f.url);
      const list=parseFeed(xml).filter(x=>isRecent(x.date,36));
      let n=0;
      for(const x of list){
        const k=x.title.toLowerCase().slice(0,70);
        if(seen.has(k))continue;           /* ข่าวเดียวกันมักโผล่หลายแหล่ง */
        seen.add(k); items.push({...x,src:f.name}); n++;
        if(n>=12)break;                    /* กันแหล่งเดียวกลบแหล่งอื่น */
      }
      ok.push(f.name+' ('+n+')');
      log('  ✓ '+f.name+' — '+n+' ข่าว');
    }catch(e){
      failed.push(f.name+': '+e.message);
      log('  ✗ '+f.name+' — '+e.message);
    }
  }
  return {items:items.slice(0,MAX_ITEM), ok, failed};
}

/* --------------------------------------------------------------- */
/* ข้อห้ามหลายข้อข้างล่างมาจากของจริงที่หลุดออกมาในรอบแรก ไม่ได้คิดเผื่อลอยๆ
     - ขึ้นต้นว่า "สวัสดีค่านักลงทุนทุกท่าน" เหมือนจดหมายข่าว
     - ปิดท้ายว่า "นักลงทุนจึงควรติดตามอย่างใกล้ชิด" ซึ่งเฉียดการให้คำแนะนำ
     - เขียนลอยๆ ว่า "ดีดตัวขึ้น" ทั้งบทโดยไม่มีตัวเลขสักตัว
   ถ้าถอดข้อห้ามพวกนี้ออก พฤติกรรมเดิมจะกลับมาทันที */
const PROMPT = `คุณเขียนสรุปข่าวตลาดให้นักลงทุนไทยที่ถือหุ้นสหรัฐฯ ทองคำ และ Bitcoin
คนอ่านคนเดียว อ่านตอนเช้าก่อนตลาดเปิด ต้องการข้อเท็จจริงล้วน ไม่ต้องการกำลังใจ

เขียนภาษาไทย 4-6 ย่อหน้า

ข้อห้ามเด็ดขาด
1. ห้ามทักทาย ห้ามขึ้นต้นด้วยคำว่าสวัสดีหรือคำต้อนรับใดๆ เข้าเนื้อหาทันที
2. ห้ามปิดท้ายด้วยการให้กำลังใจ อวยพร หรือชวนติดตาม
3. ห้ามแนะนำให้ซื้อขาย ถือ รอ หรือจับตาอะไรเป็นการส่วนตัว
   ห้ามใช้ประโยคแบบ "นักลงทุนควร..." หรือ "จึงควรติดตามอย่างใกล้ชิด"
   ให้รายงานว่ามีอะไรจะเกิดขึ้น ไม่ใช่บอกว่าคนอ่านต้องทำอะไร
4. ตัวเลขทุกตัวต้องมาจากส่วนตัวเลขตลาดข้างล่าง หรือจากแหล่งข่าวที่คุณค้นเจอจริง
   ห้ามประมาณเอง ห้ามคำนวณใหม่ ห้ามแต่งตัวเลขที่ไม่เคยเห็น
5. เรื่องไหนหาไม่เจอ ให้เขียนสั้นๆ ว่าไม่พบข้อมูลในรอบนี้ ห้ามเดาแทน
6. ห้ามใช้ markdown ห้ามดอกจัน ห้ามหัวข้อย่อย ห้าม bullet
   เขียนเป็นย่อหน้าธรรมดาคั่นด้วยบรรทัดว่าง

ข้อบังคับ
7. ย่อหน้าแรกต้องมีตัวเลขปิดจริงของ S&P 500 Nasdaq และ Dow พร้อมเปอร์เซ็นต์
   ห้ามเขียนว่าขึ้นหรือลงโดยไม่มีตัวเลขกำกับ
8. แยกข้อเท็จจริงกับการตีความให้ขาดจากกัน
   ย่อหน้าสุดท้ายย่อหน้าเดียวเป็นการตีความ ขึ้นต้นด้วยคำว่า "มุมมอง:"
   ย่อหน้าอื่นห้ามมีการคาดเดาปนเลย

ระดับความละเอียดที่ต้องการ
คุณค้นเว็บได้ ให้ค้นหาข้อมูลเหล่านี้มาใส่ให้ครบที่สุดเท่าที่หาเจอ
อย่าพอใจกับภาพกว้าง ของที่มีค่าคือตัวเลขเฉพาะเจาะจง
  - หุ้นรายตัวที่ขยับแรงที่สุด พร้อมเปอร์เซ็นต์ เช่น Micron ลง 5.6%
  - กลุ่มอุตสาหกรรมไหนนำ กลุ่มไหนรั้งท้าย พร้อมตัวเลข
  - ตัวเลขเศรษฐกิจที่เพิ่งประกาศ พร้อมค่าจริงเทียบกับที่ตลาดคาด
  - ผลประกอบการบริษัทที่เพิ่งออก พร้อม EPS และรายได้จริงเทียบคาด
  - ผลรวมทั้งสัปดาห์ ถ้าวันนี้เป็นวันจันทร์
  - ระดับราคาทองคำ น้ำมัน Bitcoin และค่าเงิน พร้อมเปอร์เซ็นต์
  - เหตุการณ์ที่มีกำหนดวันเวลาชัดเจนในสัปดาห์นี้

เขียนให้ยาวพอจะใส่รายละเอียดพวกนี้ได้ครบ ประมาณ 6-9 ย่อหน้า
บทสรุปที่สั้นแต่ลอยๆ ไร้ประโยชน์กว่าบทสรุปที่ยาวแต่มีตัวเลขจริง

ลำดับเนื้อหา
ย่อหน้า 1     ตลาดหุ้นสหรัฐฯ คืนที่ผ่านมา พร้อมตัวเลขปิดและตัวที่ขยับแรง
ย่อหน้า 2-3   เรื่องที่ขับเคลื่อนตลาด นโยบายการเงิน เงินเฟ้อ ผลประกอบการ
ย่อหน้า 4     ทองคำ น้ำมัน ค่าเงิน และ Bitcoin พร้อมตัวเลข
ย่อหน้า 5     เหตุการณ์ที่มีกำหนดจะเกิดขึ้นข้างหน้า
ย่อหน้าสุดท้าย ขึ้นต้นว่า "มุมมอง:" หนึ่งย่อหน้า

`;

function hideKey(s){ return KEY ? String(s).replaceAll(KEY,'[ซ่อน]') : String(s) }

/* เปิดให้โมเดลค้น Google เองระหว่างเขียน
   นี่คือความต่างหลักระหว่างบทสรุปใน Notion กับของเดิมบนเว็บ
   ของใน Notion เขียนโดยเอเจนต์ที่ค้นเว็บและ "อ่านบทความเต็ม" ได้
   จึงมีรายละเอียดระดับ Micron ลง 5.6% ผลผลิตอุตสาหกรรมขึ้น 0.7%
   ส่วนของเดิมมีแต่ "หัวข้อข่าว" จาก RSS ซึ่งไม่มีตัวเลขติดมาเลย
   โควตาฟรีของ grounding คือ 5,000 ครั้งต่อเดือน เราใช้วันละ 1 ครั้ง */
async function askModel(model,payload,useSearch){
  const url='https://generativelanguage.googleapis.com/v1beta/models/'
    +encodeURIComponent(model)+':generateContent';
  const req={
    contents:[{parts:[{text:payload}]}],
    generationConfig:{temperature:0.3,maxOutputTokens:4096}
  };
  if(useSearch)req.tools=[{google_search:{}}];

  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),120000);   /* ค้นเว็บด้วยจึงช้ากว่าเดิม */
  let r;
  try{
    r=await fetch(url,{method:'POST',signal:c.signal,
      headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify(req)});
  } finally { clearTimeout(t) }

  if(!r.ok){
    let t2=''; try{ t2=(await r.text()).slice(0,300) }catch(e){}
    /* ห้ามให้กุญแจหลุดออกมาใน log ไม่ว่าเซิร์ฟเวอร์จะสะท้อนอะไรกลับมา */
    const err=new Error('HTTP '+r.status+' — '+hideKey(t2));
    err.status=r.status;
    throw err;
  }
  const j=await r.json();
  const cand=j?.candidates?.[0];
  const body=(cand?.content?.parts||[]).map(p=>p.text||'').join('').trim();

  if(!body)
    throw new Error('ตอบกลับมาแต่ไม่มีเนื้อหา — '
      +'เหตุผลที่หยุด: '+(cand?.finishReason||'ไม่ระบุ'));
  if(body.length<200)
    throw new Error('บทสรุปสั้นผิดปกติ ('+body.length+' ตัวอักษร) น่าจะไม่สมบูรณ์');

  /* ดึงลิงก์บทความจริงที่โมเดลใช้อ้างอิง
     ของเดิมใส่ "ชื่อฟีด RSS" เป็นแหล่งที่มา ซึ่งกดแล้วไม่เจอข่าวที่พูดถึง
     อันนี้เป็นลิงก์บทความตรงตัว ตรวจทานตามได้จริง */
  const chunks=cand?.groundingMetadata?.groundingChunks||[];
  const cites=[];
  for(const g of chunks){
    const w=g?.web; if(!w||!w.uri)continue;
    if(cites.some(c=>c.url===w.uri))continue;
    cites.push({name:(w.title||w.domain||w.uri).slice(0,120), url:w.uri});
  }
  return {body, cites};
}

async function writeBrief(items, nums){
  const headlines = items.map((x,i)=>(i+1)+'. ['+x.src+'] '+x.title).join('\n');
  const payload   = assertNoPrivateData(
    PROMPT
    + 'ตัวเลขตลาด (ราคาปิดจริง ใช้ตัวเลขชุดนี้เท่านั้น):\n'
    + (nums.length?nums.map(s=>'- '+s).join('\n'):'- ไม่มีข้อมูลราคาในรอบนี้')
    + '\n\nหัวข้อข่าว:\n' + headlines);

  const tried=[];
  /* ลองแบบค้นเว็บก่อนทุกรุ่น ถ้าไม่ได้เลยค่อยถอยมาแบบไม่ค้น
     บทสรุปที่ไม่ได้ค้นเว็บจะตื้นกว่ามาก แต่ยังดีกว่าไม่มีอะไรเลย */
  for(const useSearch of [true,false]){
    for(const m of MODELS){
      try{
        log('  ลอง '+m+(useSearch?' (ค้นเว็บ)':' (ไม่ค้นเว็บ)'));
        const {body,cites}=await askModel(m,payload,useSearch);
        log('  ✓ ใช้ '+m+' ได้'+(cites.length?' · อ้างอิง '+cites.length+' แหล่ง':''));
        return {body:body.replace(/\*\*/g,'').replace(/^\s*[-*]\s+/gm,''),
                model:m, grounded:useSearch, cites, tried};
      }catch(e){
        tried.push(m+(useSearch?'+search':'')+': '+e.message);
        log('  ✗ '+m+' — '+e.message);
        /* 429 คือใช้โควตาหมด ไม่ใช่ชื่อรุ่นผิด เปลี่ยนรุ่นก็ไม่ช่วย
           401/403 คือกุญแจมีปัญหา ยิ่งไม่ควรยิงซ้ำให้โดนล็อก */
        if(e.status===429||e.status===401||e.status===403)
          throw new Error('หยุดเพราะโควตาหรือสิทธิ์ — '+tried.join(' · '));
      }
    }
    if(useSearch)log('  ค้นเว็บไม่ได้ทุกรุ่น ถอยไปใช้แบบอ่านหัวข้อข่าวอย่างเดียว');
  }
  throw new Error('เรียก Gemini ไม่สำเร็จทุกรุ่น — '+tried.join(' · '));
}

/* --------------------------------------------------------------- */
let statusWritten=false;
function saveStatus(obj){
  writeFileSync(STATUS, JSON.stringify(
    {ranAt:new Date().toISOString(), ...obj}, null, 2));
  statusWritten=true;
}

const T0=Date.now();
const secs=()=>((Date.now()-T0)/1000).toFixed(1)+'s';

async function main(){
  log('=== เขียนบทสรุปข่าวเช้า ===');
  /* บอกตั้งแต่บรรทัดแรกว่ากุญแจมาถึงไหม และยาวกี่ตัว (ไม่เปิดเผยค่าจริง)
     รอบที่แล้วงานล้มใน 1 วินาที ซึ่งเข้าได้กับทั้ง "ไม่มีกุญแจ" และ
     "ดึงข่าวไม่ได้ทุกแหล่ง" แยกไม่ออกจากข้างนอก จึงต้องพิมพ์ให้ชัดตรงนี้ */
  log('กุญแจ: '+(KEY?('พบ ยาว '+KEY.length+' ตัว'):'ไม่พบ')
    +' · รุ่นที่จะลอง: '+MODELS.join(', '));

  if(!KEY){
    /* ล้มแบบดัง ไม่ใช่เขียนไฟล์ว่างแล้วเงียบ
       ไฟล์เก่ายังอยู่ หน้าเว็บจะขึ้นป้ายว่าเก่ากี่วันเอง */
    saveStatus({ok:false, stage:'ตรวจกุญแจ', hasKey:false,
      reason:'ไม่พบ GEMINI_API_KEY ใน Secrets'});
    throw new Error('ไม่พบ GEMINI_API_KEY — ตั้งที่ Settings > Secrets > Actions');
  }
  /* กุญแจ Google ขึ้นต้นด้วย AIza และยาวราว 39 ตัว
     ถ้าสั้นผิดปกติ มักเป็นเพราะวางมาไม่ครบหรือวางชื่อโปรเจกต์มาแทน */
  if(KEY.length<30)
    log('  (เตือน) กุญแจสั้นผิดปกติ อาจวางมาไม่ครบ');

  log('ดึงข่าวจาก '+FEEDS.length+' แหล่ง');
  const {items, ok, failed} = await collect();
  log('รวมข่าวที่ใช้ได้ '+items.length+' หัวข้อ ('+secs()+')');

  if(items.length<5){
    saveStatus({ok:false, stage:'ดึงข่าว', hasKey:true, keyLength:KEY.length,
      reason:'ได้ข่าวแค่ '+items.length+' หัวข้อ น้อยเกินจะสรุป',
      feedsOk:ok, feedsFailed:failed});
    throw new Error('ข่าวน้อยเกินไป ('+items.length+') — '
      +'แหล่งที่ล้ม: '+(failed.join(' · ')||'ไม่มี'));
  }

  const nums = marketNumbers();
  log('ตัวเลขตลาดที่อ่านได้ '+nums.length+' รายการ');
  if(!nums.length)
    log('  (เตือน) ไม่พบไฟล์ราคาใน px/ บทสรุปจะไม่มีตัวเลขปิดกำกับ');

  log('ส่งให้ Gemini เขียนสรุป');
  const {body, model, tried, grounded, cites} = await writeBrief(items, nums);
  log('ได้บทสรุป '+body.length+' ตัวอักษร'+(grounded?' (ค้นเว็บ)':' (ไม่ได้ค้นเว็บ)'));

  /* ตรวจว่าทำตามข้อห้ามที่เคยหลุดมาแล้วจริงไหม
     ไม่ถึงกับทิ้งงาน แต่ต้องมีร่องรอยไว้ ไม่งั้นคุณภาพจะค่อยๆ เลื่อนกลับโดยไม่มีใครเห็น */
  const warns=[];
  if(/^\s*(สวัสดี|ยินดีต้อนรับ|อรุณสวัสดิ์)/.test(body))warns.push('ขึ้นต้นด้วยคำทักทาย');
  if(/นักลงทุน(จึง)?ควร|ควรติดตามอย่างใกล้ชิด|แนะนำให้/.test(body))warns.push('มีประโยคเชิงแนะนำ');
  if(!/มุมมอง:/.test(body))warns.push('ไม่มีย่อหน้า "มุมมอง:" ที่แยกการตีความออกมา');
  if(/\*\*|^\s*[-*]\s/m.test(body))warns.push('มี markdown ปน');
  if(!/\d/.test(body.split(/\n{2,}/)[0]||''))warns.push('ย่อหน้าแรกไม่มีตัวเลขปิดกำกับ');
  if(!grounded)warns.push('ไม่ได้ค้นเว็บ บทสรุปจะตื้นกว่าปกติมาก');
  /* นับความหนาแน่นของตัวเลข เป็นตัวชี้วัดว่า "ลึกจริง" หรือแค่ "ยาว"
     ของที่เขียนลอยๆ จะมีตัวเลขน้อยมากแม้จะยาว */
  const digits=(body.match(/\d+(\.\d+)?%/g)||[]).length;
  if(digits<8)warns.push('มีตัวเลขเปอร์เซ็นต์แค่ '+digits+' ตัว ถือว่าบางไป');
  if(body.split(/\n{2,}/).length<5)warns.push('ได้แค่ '+body.split(/\n{2,}/).length+' ย่อหน้า');
  if(warns.length)log('(เตือนคุณภาพ) '+warns.join(' · '));

  /* ตรวจอีกรอบ "ขาออก" — เผื่อโมเดลถูกป้อนอะไรแปลกมาแล้วสะท้อนกลับ */
  assertNoPrivateData(body);

  /* แหล่งอ้างอิง
     ถ้าค้นเว็บได้ ใช้ลิงก์บทความจริงที่โมเดลอ้างถึง กดแล้วเจอข่าวนั้นเลย
     ถ้าค้นไม่ได้ ถอยไปใช้ชื่อฟีด RSS แบบเดิม ซึ่งบอกได้แค่ว่ามาจากสำนักไหน */
  let sources;
  if(grounded&&cites.length){
    sources=cites.slice(0,12);
    log('แหล่งอ้างอิงเป็นลิงก์บทความจริง '+sources.length+' แหล่ง');
  }else{
    const used=[...new Set(items.map(x=>x.src))];
    sources=used.map(n=>({name:n+' (ฟีดข่าว ไม่ใช่ลิงก์บทความ)',
      url:(FEEDS.find(f=>f.name===n)||{}).url||''}));
    log('ไม่มีลิงก์บทความ ใช้ชื่อฟีดแทน '+sources.length+' แหล่ง');
  }

  const out={
    date: new Date().toISOString().slice(0,10),
    body,
    sources,
    meta:{ writtenBy:'github-actions/'+model, grounded:!!grounded,
           headlines:items.length }
  };
  writeFileSync(OUT, JSON.stringify(out,null,2));
  saveStatus({ok:true, model, grounded:!!grounded, citedUrls:sources.length,
    modelsFailed:tried, chars:body.length, paragraphs:body.split(/\n{2,}/).length,
    headlines:items.length, prices:nums.length, qualityWarnings:warns,
    feedsOk:ok, feedsFailed:failed});
  log('เขียน '+OUT+' เรียบร้อย — วันที่ '+out.date);
}

main().catch(e=>{
  /* เขียนสถานะไว้เสมอไม่ว่าจะล้มด้วยเหตุใด
     รอบที่ผ่านมามีแค่สองเส้นทางที่เขียนสถานะ คือไม่มีกุญแจกับข่าวน้อยเกินไป
     พอล้มด้วยเหตุอื่น จึงไม่เหลือร่องรอยอะไรให้ตามเลย
     ต้องเดาจากเวลาที่ใช้ไป 1 วินาที ซึ่งไม่ใช่วิธีที่ควรต้องใช้ */
  /* เขียนเฉพาะตอนที่ยังไม่มีใครเขียน ไม่งั้นจะไปทับของที่ระบุขั้นตอนไว้ชัดแล้ว
     ด้วยข้อความกว้างๆ ว่า "ไม่ทราบขั้นตอน" ซึ่งแย่กว่าเดิม (เจอตอนทดสอบ) */
  if(!statusWritten){
    try{
      saveStatus({ok:false, reason:hideKey(e.message),
        stage:'ไม่ทราบขั้นตอน (ล้มนอกเส้นทางที่ดักไว้)',
        hasKey:!!KEY, keyLength:KEY?KEY.length:0, elapsed:secs()});
    }catch(e2){ console.error('เขียนไฟล์สถานะไม่ได้ด้วย: '+e2.message) }
  }
  console.error('ล้มเหลว: '+hideKey(e.message));
  process.exit(1);
});
