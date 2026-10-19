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
   ตั้ง GEMINI_MODEL ใน Secrets เพื่อบังคับใช้ตัวใดตัวหนึ่งก็ได้ */
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest','gemini-2.5-flash','gemini-2.0-flash','gemini-flash-lite-latest'];
const REQ_MS   = Number(process.env.BRIEF_REQ_MS || 20000);
const MAX_ITEM = Number(process.env.BRIEF_MAX_ITEMS || 45);

/* แหล่งข่าวที่เปิด RSS ให้ใช้ฟรี ไม่ต้องใช้กุญแจ
   เลือกหลายแหล่งเพราะแหล่งเดียวล่มแล้วจบ และมุมมองเดียวก็เอียงง่าย */
const FEEDS = [
  { name:'CNBC Markets',      url:'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { name:'CNBC Economy',      url:'https://www.cnbc.com/id/20910213/device/rss/rss.html' },
  { name:'Yahoo Finance',     url:'https://finance.yahoo.com/news/rssindex' },
  { name:'MarketWatch Top',   url:'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name:'Investing.com',     url:'https://www.investing.com/rss/news_25.rss' },
  { name:'Federal Reserve',   url:'https://www.federalreserve.gov/feeds/press_all.xml' },
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
const PROMPT = `คุณเป็นนักวิเคราะห์ตลาดที่เขียนสรุปข่าวเช้าให้นักลงทุนไทยที่ลงทุนหุ้นสหรัฐฯ ทองคำ และ Bitcoin

เขียนบทสรุปภาษาไทย 4-6 ย่อหน้า จากหัวข้อข่าวที่ให้มาข้างล่าง

กฎที่ห้ามละเมิด
1. ใช้เฉพาะข้อมูลจากหัวข้อข่าวที่ให้มา ห้ามเติมตัวเลขหรือเหตุการณ์ที่ไม่มีในนั้น
2. ถ้าไม่มีข่าวเรื่องไหนเลย ให้บอกว่า "ไม่พบข่าวเรื่องนี้ในรอบนี้" ห้ามเดา
3. แยกให้ชัดระหว่างข้อเท็จจริงจากข่าว กับการตีความ
   ย่อหน้าที่เป็นการตีความให้ขึ้นต้นว่า "มุมมอง:" เสมอ
4. ห้ามแนะนำให้ซื้อหรือขายอะไรทั้งสิ้น ไม่ว่าทางตรงหรือทางอ้อม
5. เขียนเป็นย่อหน้าธรรมดา คั่นด้วยบรรทัดว่าง ห้ามใช้หัวข้อย่อย ห้ามใช้ bullet
6. ห้ามใส่ markdown ห้ามใส่ดอกจัน

ลำดับเนื้อหา
- ย่อหน้าแรก ภาพรวมตลาดหุ้นสหรัฐฯ คืนที่ผ่านมา
- ถัดมา เรื่องที่ขับเคลื่อนตลาดจริง เช่น นโยบายการเงิน เงินเฟ้อ ผลประกอบการ
- ทองคำ น้ำมัน และ Bitcoin
- สิ่งที่ต้องจับตาวันนี้
- ปิดท้ายด้วยย่อหน้า "มุมมอง:" หนึ่งย่อหน้า

หัวข้อข่าว:
`;

function hideKey(s){ return KEY ? String(s).replaceAll(KEY,'[ซ่อน]') : String(s) }

async function askModel(model,payload){
  const url='https://generativelanguage.googleapis.com/v1beta/models/'
    +encodeURIComponent(model)+':generateContent';
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),60000);
  let r;
  try{
    r=await fetch(url,{method:'POST',signal:c.signal,
      headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify({
        contents:[{parts:[{text:payload}]}],
        generationConfig:{temperature:0.3,maxOutputTokens:2048}
      })});
  } finally { clearTimeout(t) }

  if(!r.ok){
    let t2=''; try{ t2=(await r.text()).slice(0,300) }catch(e){}
    /* ห้ามให้กุญแจหลุดออกมาใน log ไม่ว่าเซิร์ฟเวอร์จะสะท้อนอะไรกลับมา */
    const err=new Error('HTTP '+r.status+' — '+hideKey(t2));
    err.status=r.status;
    throw err;
  }
  const j=await r.json();
  const body=(j?.candidates?.[0]?.content?.parts||[])
    .map(p=>p.text||'').join('').trim();

  if(!body)
    throw new Error('ตอบกลับมาแต่ไม่มีเนื้อหา — '
      +'เหตุผลที่หยุด: '+(j?.candidates?.[0]?.finishReason||'ไม่ระบุ'));
  if(body.length<200)
    throw new Error('บทสรุปสั้นผิดปกติ ('+body.length+' ตัวอักษร) น่าจะไม่สมบูรณ์');
  return body;
}

async function writeBrief(items){
  const headlines = items.map((x,i)=>(i+1)+'. ['+x.src+'] '+x.title).join('\n');
  const payload   = assertNoPrivateData(PROMPT + headlines);

  const tried=[];
  for(const m of MODELS){
    try{
      log('  ลอง '+m);
      const body=await askModel(m,payload);
      log('  ✓ ใช้ '+m+' ได้');
      return {body:body.replace(/\*\*/g,'').replace(/^\s*[-*]\s+/gm,''), model:m};
    }catch(e){
      tried.push(m+': '+e.message);
      log('  ✗ '+m+' — '+e.message);
      /* 429 คือใช้โควตาหมด ไม่ใช่ชื่อรุ่นผิด เปลี่ยนรุ่นก็ไม่ช่วย
         401/403 คือกุญแจมีปัญหา ยิ่งไม่ควรยิงซ้ำให้โดนล็อก */
      if(e.status===429||e.status===401||e.status===403)break;
    }
  }
  throw new Error('เรียก Gemini ไม่สำเร็จทุกรุ่น — '+tried.join(' · '));
}

/* --------------------------------------------------------------- */
function saveStatus(obj){
  writeFileSync(STATUS, JSON.stringify(
    {ranAt:new Date().toISOString(), ...obj}, null, 2));
}

async function main(){
  log('=== เขียนบทสรุปข่าวเช้า ===');

  if(!KEY){
    /* ล้มแบบดัง ไม่ใช่เขียนไฟล์ว่างแล้วเงียบ
       ไฟล์เก่ายังอยู่ หน้าเว็บจะขึ้นป้ายว่าเก่ากี่วันเอง */
    saveStatus({ok:false, reason:'ไม่พบ GEMINI_API_KEY ใน Secrets'});
    throw new Error('ไม่พบ GEMINI_API_KEY — ตั้งที่ Settings > Secrets > Actions');
  }

  log('ดึงข่าวจาก '+FEEDS.length+' แหล่ง');
  const {items, ok, failed} = await collect();
  log('รวมข่าวที่ใช้ได้ '+items.length+' หัวข้อ');

  if(items.length<5){
    saveStatus({ok:false, reason:'ได้ข่าวแค่ '+items.length+' หัวข้อ น้อยเกินจะสรุป',
      feedsOk:ok, feedsFailed:failed});
    throw new Error('ข่าวน้อยเกินไป ('+items.length+') — '
      +'แหล่งที่ล้ม: '+(failed.join(' · ')||'ไม่มี'));
  }

  log('ส่งให้ Gemini เขียนสรุป');
  const {body, model} = await writeBrief(items);
  log('ได้บทสรุป '+body.length+' ตัวอักษร');

  /* ตรวจอีกรอบ "ขาออก" — เผื่อโมเดลถูกป้อนอะไรแปลกมาแล้วสะท้อนกลับ */
  assertNoPrivateData(body);

  /* แหล่งอ้างอิง เอาเฉพาะแหล่งที่ใช้จริง ไม่ใส่ทุกแหล่งที่พยายามดึง */
  const used=[...new Set(items.map(x=>x.src))];
  const sources=used.map(n=>({name:n, url:(FEEDS.find(f=>f.name===n)||{}).url||''}));

  const out={
    date: new Date().toISOString().slice(0,10),
    body,
    sources,
    meta:{ writtenBy:'github-actions/'+model, headlines:items.length }
  };
  writeFileSync(OUT, JSON.stringify(out,null,2));
  saveStatus({ok:true, model, chars:body.length, headlines:items.length,
    feedsOk:ok, feedsFailed:failed});
  log('เขียน '+OUT+' เรียบร้อย — วันที่ '+out.date);
}

main().catch(e=>{
  console.error('ล้มเหลว: '+e.message);
  process.exit(1);
});
