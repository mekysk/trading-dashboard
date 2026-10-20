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
   (gemini 2.0 ถูกปิดไปตั้งแต่ 1 มิ.ย. 2026 จึงเอาออก)

   หลักฐานจากการรันจริง
     รอบ 1  flash-lite-latest ใช้ได้  (สามตัวก่อนหน้าล้ม)
     รอบ 3  flash-latest+ค้นเว็บ ตอบ 429 ตั้งแต่ตัวแรก
   429 ของ Google ไม่ได้แปลว่าใช้หมดทั้งบัญชี รุ่นที่ไม่มีโควตาฟรีก็ตอบ 429
   จึงต้องไล่ลองต่อ ไม่ใช่หยุด  และเอาตัวที่พิสูจน์แล้วว่าใช้ได้ไว้ให้ถึงเร็วขึ้น

     รอบ 4  Google ตอบ 404 พร้อมบอกชื่อรุ่นใหม่มาให้ตรงๆ
            "models/gemini-2.5-flash is no longer available to new users.
             Please update your code to use models/gemini-3.8-flash"
            "models/gemini-2.5-flash-lite ... use models/gemini-3.5-flash-lite"
          ส่วน flash-latest กับ flash-lite-latest ตอบ 429 ตอนเปิดค้นเว็บ
          แปลว่าสองตัวนั้นไม่มีโควตาค้นเว็บฟรี
          จึงเอารุ่น 3.x ที่ Google บอกมาขึ้นก่อน เพราะกลุ่ม 3.x คือกลุ่มที่
          มีโควตาค้นเว็บฟรี 5,000 ครั้งต่อเดือน */
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.8-flash','gemini-3.5-flash-lite',
     'gemini-flash-latest','gemini-flash-lite-latest'];

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
/* พอเพิ่มจำนวนฟีด แต่ละฟีดจะได้โควตาในรายการรวมน้อยลง
   ตอนมี 8 ฟีด เพดาน 45 แปลว่าได้ฟีดละราว 5 ข่าว
   พอเป็น 10 ฟีด เหลือฟีดละ 4 ซึ่งทำให้แหล่งที่อ่านเนื้อได้มีตัวเลือกน้อยลง
   ขยายเพดานตามจำนวนฟีด */
const MAX_ITEM = Number(process.env.BRIEF_MAX_ITEMS || 70);

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
/* เพิ่มฟีด CNBC หลายหมวด เพราะ cnbc.com เป็นแหล่งข่าวหุ้นสหรัฐฯ เจ้าเดียว
   ที่พิสูจน์แล้วว่ายอมให้อ่านเนื้อบทความ (marketwatch กับ investing บล็อก)
   ฟีดหมวดอื่นผมยังไม่ได้ยืนยันว่ามีจริง ถ้า 404 สคริปต์จะบันทึกไว้ใน
   feedsFailed ให้เอง แล้วค่อยลบทิ้งทีหลัง ไม่ทำให้งานล้ม */
const FEEDS = [
  { name:'CNBC Markets',       url:'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  /* ผลการลองจริง 20 ต.ค.
       CNBC Top       ให้ 12 หัวข้อ  เก็บไว้
       CNBC Finance   ให้  1 หัวข้อ  เก็บไว้ ได้น้อยแต่ไม่เสียหาย
       CNBC Earnings  ให้  0 หัวข้อ  ตัดทิ้ง
       CNBC Economy   ตอบ 404        ตัดทิ้ง */
  { name:'CNBC Top',           url:'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name:'CNBC Finance',       url:'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
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
/* สำนักข่าวจำนวนมากปฏิเสธ User-Agent แปลกๆ ด้วย 403 ทันที
   ตัวเดิมประกาศตัวว่าเป็น trading-dashboard/1.0 จึงโดนบล็อกเกือบหมด
   รอบที่แล้วอ่านบทความสำเร็จแค่ 2 จาก 14 ด้วยเหตุนี้
   ใช้ UA แบบเบราว์เซอร์ทั่วไปแทน เป็นการอ่านหน้าข่าวสาธารณะตามปกติ */
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  +'(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function get(url,ms,kind){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),ms||REQ_MS);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{
      'User-Agent':UA,
      'Accept-Language':'en-US,en;q=0.9',
      'Accept': kind==='html'
        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        : 'application/rss+xml, application/xml, text/xml, */*'}});
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
    /* ฟีดส่วนใหญ่แนบย่อหน้าสรุปมาให้ในช่อง description อยู่แล้ว
       และหลายเจ้าใส่ตัวเลขจริงไว้ในนั้น เช่น CoinDesk เขียนว่า
       "Bitcoin rose 0.8% to around $82,700 as China's GDP beat estimates"
       ของฟรีที่ไม่ต้องยิงขออ่านหน้าเว็บ จึงไม่มีทางโดน 401/403
       ผมมองข้ามช่องนี้มาตั้งแต่ต้น ทั้งที่มันแก้ปัญหาเว็บบล็อกได้ครึ่งหนึ่ง */
    const desc=pick(b,'description')||pick(b,'summary')||'';
    out.push({title:clean(title), link:(link||'').trim(), date:date.trim(),
      desc:clean(desc).slice(0,400)});
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

/* ---------------------------------------------------------------
   ดึงเนื้อบทความเต็ม  —  ทางแทนการค้นเว็บของ Google

   หลักฐานจากการรันจริง 2 รอบ: ขอค้นเว็บกับ 4 รุ่น ได้ 429 เหมือนกันหมด
   ทั้ง gemini-3.8-flash, 3.5-flash-lite, flash-latest, flash-lite-latest
   แปลว่ากุญแจฟรีใบนี้ไม่มีโควตาค้นเว็บเลย ไม่ใช่เรื่องชื่อรุ่นผิดอีกแล้ว

   แต่สิ่งที่การค้นเว็บให้ คือ "เนื้อบทความเต็ม" ไม่ใช่เวทมนตร์อะไร
   และเรามีลิงก์บทความอยู่แล้วจาก RSS  จึงไปอ่านเองเสียเลย
   เครื่องของ GitHub ต่อเน็ตได้อิสระ ไม่ติด CORS แบบเบราว์เซอร์
   ได้ผลแบบเดียวกัน ฟรี และไม่ต้องง้อโควตาใคร
   --------------------------------------------------------------- */
/* ลองมากกว่าที่ต้องการ เพราะสำนักข่าวหลายเจ้าบล็อกหรือมีกำแพงจ่ายเงิน
   ยอมอ่านพลาดบ้าง ดีกว่าได้มาแค่สองบทความแล้วเขียนลอยๆ */
const ART_N  = Number(process.env.BRIEF_ARTICLES || 20);
const ART_MS = Number(process.env.BRIEF_ART_MS || 9000);

function readable(html){
  /* ลอกแท็ก -> ถอดสัญลักษณ์ -> ลอกแท็กอีกรอบ  เหตุผลเดียวกับใน clean()
     ถ้าลอกรอบเดียวแล้วค่อยถอด &lt;strong&gt; จะกลายเป็น <strong> โผล่กลับมา
     ผมเคยแก้บั๊กนี้ไปแล้วใน clean() แล้วมาเขียนฟังก์ชันใหม่พลาดซ้ำที่เดิม */
  const entity=t=>t
    .replace(/&nbsp;/g,' ')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d))
    .replace(/&amp;/g,'&');        /* &amp; ท้ายสุดเสมอ */
  const pre=String(html)
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi,'\n');
  return entity(pre.replace(/<[^>]+>/g,' '))
    .replace(/<[^>]+>/g,' ')       /* รอบสองสำหรับแท็กที่เพิ่งถูกถอดออกมา */
    .replace(/[ \t]+/g,' ')
    .split('\n').map(s=>s.trim())
    /* เก็บเฉพาะบรรทัดที่ "เหมือนย่อหน้าข่าวจริง"
       ยาวพอ  มีช่องว่างเยอะแบบประโยค  ไม่ใช่ลิงก์หรือบรรทัดข้อมูลเทคนิค
       ถ้ากรองแค่ความยาว เมนูยาวๆ กับ URL จะผ่านเข้ามาเต็มไปหมด
       แล้วพอตัดเอาแค่ 2,600 ตัวแรก อาจได้แต่ขยะไม่ได้เนื้อข่าวเลย */
    /* เกณฑ์นี้เคยตั้งไว้เข้มกว่านี้ (ยาว 60 และมีช่องว่าง 8)
       ซึ่งจูนมาจากหน้าเดียว อาจตัดย่อหน้าสั้นๆ ที่เป็นเนื้อข่าวจริงทิ้งไปด้วย
       ผ่อนลงมาเป็น 45 กับ 6 ซึ่งยังกันเมนูและป้ายกำกับได้อยู่ */
    .filter(s=>
      s.length>45 &&
      (s.match(/ /g)||[]).length>=6 &&        /* เป็นประโยค ไม่ใช่ป้ายกำกับ */
      !/https?:\/\//.test(s) &&               /* ไม่ใช่ลิงก์ */
      !/^[a-z][a-z0-9:_-]*:\s/i.test(s))      /* ไม่ใช่บรรทัดแบบ key: value */
    .join('\n');
}

/* เว็บที่พิสูจน์แล้วว่าไม่ให้อ่านบทความ ข้ามไปเลย อย่าเสียเวลายิง
   หลักฐานจากการรันจริง 19 ต.ค. — marketwatch 401 สิบครั้ง · investing 403 แปดครั้ง
   ยังใช้หัวข้อข่าวของสองเจ้านี้ต่อไป แค่ไม่ไปขออ่านเนื้อเต็ม
   รอบที่แล้วเสียเวลาไป 90 วินาทีกับการยิงหาเว็บที่ไม่มีวันตอบ
   ถ้าวันหนึ่งเขาเปิดให้ ก็แค่ลบชื่อออกจากรายการนี้ */
const NO_FETCH=['marketwatch.com','investing.com'];

/* ให้คะแนนความเกี่ยวข้องกับตลาด
   รอบที่แล้วมันอ่านบทความเรื่อง "ภาษาโปรแกรมใหม่ของ Cardano" กับ
   "เครื่องมือย้ายคริปโตโดยไม่ต้องก๊อปที่อยู่กระเป๋า" ซึ่งไม่เกี่ยวกับพอร์ตเลย
   แล้วเอาไปเขียนเป็นย่อหน้าหนึ่งในบทสรุป เพราะมันมีแค่นั้นให้อ่าน
   การเลือกว่าจะอ่านอะไร สำคัญพอๆ กับการอ่านได้ */
/* เพิ่มคำที่พลาดไปรอบที่แล้ว
   \bfed\b ไม่จับคำว่า Federal Reserve เพราะ Federal ไม่ใช่คำว่า fed
   ข่าวของธนาคารกลางสหรัฐฯ ทั้ง 12 หัวข้อจึงได้ 0 คะแนนและถูกคัดทิ้งหมด
   ทั้งที่เป็นแหล่งที่ยอมให้อ่านเนื้อและเกี่ยวกับตลาดโดยตรง */
const GOOD=/\b(stock|stocks|shares|equit|nasdaq|s&p|dow|russell|index|indices|futures|yield|treasur|bond|fed|federal reserve|fomc|powell|warsh|monetary|interest rate|rate cut|rate hike|rates|inflation|cpi|ppi|gdp|jobs|payroll|unemployment|earnings|revenue|guidance|profit|selloff|sell-off|rally|slump|rebound|chip|semiconductor|gold|bullion|oil|crude|wti|brent|bitcoin|btc|ether|crypto market|dollar|currency|forex|tariff|central bank|wall street|market|markets|investor|trading)\b/i;
const JUNK=/\b(how to|guide|review|airdrop|giveaway|sponsored|press release|programming language|wallet address|job loss|hiring|dating|recipe|horoscope|nft art|testnet|mainnet upgrade)\b/i;

function relevance(x){
  const t=(x.title+' '+(x.desc||''));
  let s=0;
  const hits=t.match(new RegExp(GOOD.source,'gi'));
  if(hits)s+=Math.min(hits.length,6);
  if(JUNK.test(t))s-=5;
  /* ข่าวที่มีตัวเลขเปอร์เซ็นต์หรือราคาอยู่แล้ว มักเป็นข่าวตลาดจริง */
  if(/\d+(\.\d+)?%/.test(t))s+=2;
  if(/\$\s?[\d,]{3,}/.test(t))s+=1;
  return s;
}

async function fetchArticles(items){
  const ok=items.filter(x=>{
    if(!/^https?:\/\//.test(x.link))return false;
    try{
      const h=new URL(x.link).hostname.replace(/^www\./,'');
      return !NO_FETCH.some(d=>h===d||h.endsWith('.'+d));
    }catch(e){ return false }
  });
  /* เรียงตามความเกี่ยวข้อง เอาตัวที่ได้คะแนนก่อน
     แต่ถ้าได้น้อยเกินไป ให้เติมด้วยตัวที่คะแนน 0 (ยังไม่ติดลบ) จนครบขั้นต่ำ
     รอบที่แล้วผมตัดที่ s>0 เฉยๆ แล้วเหลือ 3 บทความ ซึ่งน้อยกว่าตอนไม่คัดเลย
     ตัวคัดกรองที่เข้มจนอดอยาก แย่กว่าตัวคัดกรองที่ปล่อยผ่านบ้าง
     ตัวที่ติดลบ (ข่าวไม่เกี่ยวชัดเจน) ไม่เอาเด็ดขาดไม่ว่าจะขาดแค่ไหน */
  const scored=ok.map(x=>({x,s:relevance(x)})).sort((a,b)=>b.s-a.s);
  const strong=scored.filter(o=>o.s>0);
  const spare =scored.filter(o=>o.s===0);
  const MIN=Number(process.env.BRIEF_MIN_ARTICLES||8);
  const picked=[...strong, ...spare.slice(0,Math.max(0,MIN-strong.length))]
    .slice(0,ART_N).map(o=>o.x);
  log('  คัดบทความได้ '+picked.length+' (ตรงประเด็น '+strong.length
    +' · เติม '+(picked.length-Math.min(strong.length,picked.length))
    +') จากลิงก์ที่อ่านได้ '+ok.length);
  const out=[], fails=[];
  /* ดึงพร้อมกันทีละ 5 เพื่อไม่ให้ช้าเกินไป และไม่ถล่มเว็บใครมากเกิน */
  for(let i=0;i<picked.length;i+=5){
    const batch=picked.slice(i,i+5);
    const res=await Promise.all(batch.map(async x=>{
      const host=(()=>{try{return new URL(x.link).hostname.replace(/^www\./,'')}
                       catch(e){return '?'}})();
      try{
        const html=await get(x.link,ART_MS,'html');
        const txt=readable(html);
        if(txt.length<250)throw new Error('เนื้อหาสั้นเกินไป '+txt.length+' ตัว');
        /* 2,600 ตัวต่อบทความ คูณ 12 บท ยาวเกินจำเป็น
           ตัวเลขสำคัญมักอยู่ช่วงต้นของข่าว ย่อลงได้โดยไม่เสียสาระ */
        return {...x, text:txt.slice(0,1900)};
      }catch(e){
        /* เก็บเหตุผลไว้เสมอ รอบที่แล้วผมนับแค่จำนวนที่ล้ม ไม่ได้เก็บว่าล้มเพราะอะไร
           พอได้ 2 จาก 14 จึงไม่รู้ว่าโดนบล็อก เว็บล่ม หรือตัวกรองผมเข้มเกินไป
           เป็นความผิดพลาดแบบเดียวกับที่เจอมาหลายรอบในงานนี้ */
        fails.push(host+': '+e.message);
        return null;
      }
    }));
    out.push(...res.filter(Boolean));
  }
  log('  อ่านบทความเต็มได้ '+out.length+' จาก '+picked.length+' ลิงก์');
  for(const f of fails)log('    ✗ '+f);
  return {articles:out, fails};
}

async function collect(){
  const ok=[], failed=[];
  /* ดึงฟีดพร้อมกัน ไม่ใช่ทีละอัน
     รอบที่แล้วใช้เวลารวม 92 วินาที ส่วนใหญ่หมดไปกับการยืนรอฟีดทีละเจ้า
     ฟีดไม่ได้ขึ้นต่อกัน จึงไม่มีเหตุผลต้องรอให้เสร็จทีละอัน */
  const raw=await Promise.all(FEEDS.map(async f=>{
    try{
      const xml=await get(f.url);
      return {f, list:parseFeed(xml).filter(x=>isRecent(x.date,36))};
    }catch(e){ return {f, err:e.message} }
  }));

  /* ตัดข่าวซ้ำหลังจากได้มาครบแล้ว ต้องทำตามลำดับเดิมเสมอ
     ไม่งั้นผลจะเปลี่ยนไปมาตามว่าฟีดไหนตอบก่อน */
  const seen=new Set(), perFeed=[];
  for(const r of raw){
    if(r.err){
      perFeed.push([]);
      failed.push(r.f.name+': '+r.err);
      log('  ✗ '+r.f.name+' — '+r.err);
      continue;
    }
    const mine=[];
    for(const x of r.list){
      const k=x.title.toLowerCase().slice(0,70);
      if(seen.has(k))continue;             /* ข่าวเดียวกันมักโผล่หลายแหล่ง */
      seen.add(k); mine.push({...x,src:r.f.name});
      if(mine.length>=12)break;            /* กันแหล่งเดียวกลบแหล่งอื่น */
    }
    perFeed.push(mine);
    ok.push(r.f.name+' ('+mine.length+')');
    log('  ✓ '+r.f.name+' — '+mine.length+' ข่าว');
  }
  /* สลับหยิบทีละแหล่งวนไป ไม่ใช่ต่อท้ายกันไปเรื่อยๆ
     ของเดิมเรียงตามลำดับฟีด ทำให้ 20 ลิงก์แรกเป็นของสองแหล่งแรกล้วน
     ซึ่งบังเอิญเป็นสองเจ้าที่บล็อกการอ่านบทความพอดี (401 กับ 403)
     ส่วนแหล่งที่อ่านได้จริงถูกผลักไปท้ายแถวจนไม่เคยถูกเลือกเลย
     สลับแบบนี้ทำให้ทุกแหล่งมีสิทธิ์เท่ากัน และหัวข้อข่าวก็กระจายหมวดด้วย */
  const items=[];
  for(let i=0;i<12;i++)
    for(const list of perFeed)
      if(list[i])items.push(list[i]);
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
4ก. ระดับราคาของดัชนี ทองคำ น้ำมัน และ Bitcoin ให้ใช้จาก "ตัวเลขตลาด" เท่านั้น
   ห้ามหยิบระดับราคาจากหัวข้อข่าวมาใช้เด็ดขาด เพราะหัวข้อข่าวอาจเป็นของเก่า
   ตัวอย่างที่เคยเขียนผิดจริง เขียนว่าบิตคอยน์ปิดที่ 81,533 แล้วต่อท้ายว่า
   "ยืนเหนือระดับ 82,000" ซึ่งขัดกันเองในประโยคเดียว เพราะไปหยิบเลขจากข่าวมาปน
   ถ้าจะบรรยายว่ายืนเหนือหรือต่ำกว่าระดับใด ต้องสอดคล้องกับราคาที่ให้มาเสมอ
4ข. เขียนเป็นภาษาไทยล้วน ยกเว้นชื่อเฉพาะภาษาอังกฤษ
   ห้ามมีตัวอักษรภาษาอื่นปนเด็ดขาด เช่น อักษรเกาหลี จีน หรือญี่ปุ่น
5. เรื่องไหนหาไม่เจอ ให้เขียนสั้นๆ ว่าไม่พบข้อมูลในรอบนี้ ห้ามเดาแทน
5ก. ข่าวที่ไม่เกี่ยวกับตลาดหุ้นสหรัฐฯ ทองคำ น้ำมัน ค่าเงิน หรือ Bitcoin
   ให้ข้ามไปเลย ห้ามเอามาเขียนเพื่อให้ครบจำนวนย่อหน้า
   เช่น ข่าวเทคโนโลยีของเหรียญเล็กๆ ข่าวตลาดหุ้นประเทศอื่นที่ไม่กระทบสหรัฐฯ
   หรือข่าวสังคมทั่วไป  บทสรุปสั้นแต่ตรงประเด็น ดีกว่ายาวแล้วมีเรื่องไม่เกี่ยวปน
   ถ้าข่าวในรอบนี้มีสาระน้อย ให้เขียนสั้นลงได้ ไม่ต้องฝืนให้ครบ
6. ห้ามใช้ markdown ห้ามดอกจัน ห้ามหัวข้อย่อย ห้าม bullet
   เขียนเป็นย่อหน้าธรรมดาคั่นด้วยบรรทัดว่าง

ข้อบังคับ
7. ย่อหน้าแรกต้องมีตัวเลขปิดจริงของ S&P 500 Nasdaq และ Dow พร้อมเปอร์เซ็นต์
   ห้ามเขียนว่าขึ้นหรือลงโดยไม่มีตัวเลขกำกับ
8. แยกข้อเท็จจริงกับการตีความให้ขาดจากกัน
   ย่อหน้าสุดท้ายย่อหน้าเดียวเป็นการตีความ ขึ้นต้นด้วยคำว่า "มุมมอง:"
   ย่อหน้าอื่นห้ามมีการคาดเดาปนเลย

ระดับความละเอียดที่ต้องการ
ข้างล่างมีเนื้อบทความเต็มให้แล้ว ไม่ใช่แค่หัวข้อ
ตัวเลขรายละเอียดซ่อนอยู่ในเนื้อบทความ หน้าที่ของคุณคือขุดมันออกมาใช้
อย่าพอใจกับภาพกว้าง ของที่มีค่าคือตัวเลขเฉพาะเจาะจง
  - หุ้นรายตัวที่ขยับแรงที่สุด พร้อมเปอร์เซ็นต์ เช่น Micron ลง 5.6%
  - กลุ่มอุตสาหกรรมไหนนำ กลุ่มไหนรั้งท้าย พร้อมตัวเลข
  - ตัวเลขเศรษฐกิจที่เพิ่งประกาศ พร้อมค่าจริงเทียบกับที่ตลาดคาด
  - ผลประกอบการบริษัทที่เพิ่งออก พร้อม EPS และรายได้จริงเทียบคาด
  - ผลรวมทั้งสัปดาห์ ถ้าวันนี้เป็นวันจันทร์
  - ระดับราคาทองคำ น้ำมัน Bitcoin และค่าเงิน พร้อมเปอร์เซ็นต์
  - เหตุการณ์ที่มีกำหนดวันเวลาชัดเจนในสัปดาห์นี้

เขียนให้ยาวพอจะใส่รายละเอียดพวกนี้ได้ครบ อย่างน้อย 5 ย่อหน้า ไม่เกิน 8
บทสรุปที่สั้นแต่ลอยๆ ไร้ประโยชน์กว่าบทสรุปที่ยาวแต่มีตัวเลขจริง
ข้อ 5ก ที่ให้ข้ามข่าวไม่เกี่ยว ไม่ได้แปลว่าให้เขียนสั้นลงเรื่อยๆ
ให้ตัดเฉพาะเรื่องที่ไม่เกี่ยว แล้วลงลึกกับเรื่องที่เกี่ยวแทน

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

async function writeBrief(items, nums, articles, extra){
  /* แนบย่อหน้าสรุปของแต่ละข่าวไปด้วย ถ้าฟีดให้มา
     ต่างกันมากระหว่าง "Gold rises as Warsh remarks curb Fed hike bets"
     กับบรรทัดเดียวกันที่มีตัวเลขต่อท้ายว่าขึ้นกี่เปอร์เซ็นต์ไปที่เท่าไหร่ */
  /* 70 หัวข้อพร้อมย่อหน้าสรุปทุกอัน บวกบทความเต็มอีก 12 บท
     ทำให้คำสั่งยาวจนรุ่นที่ดีที่สุดคิดไม่ทันใน 2 นาทีแล้วหลุดไปใช้รุ่นเล็ก
     ย่อหน้าสรุปมีค่าที่สุดกับข่าวอันดับต้นๆ ที่ไม่ได้อ่านเนื้อเต็ม
     อันท้ายๆ ใส่แค่หัวข้อพอ */
  const DESC_N=Number(process.env.BRIEF_DESC_ITEMS||28);
  const headlines = items.map((x,i)=>
    (i+1)+'. ['+x.src+'] '+x.title
    +(x.desc&&i<DESC_N?'\n   '+x.desc:'')).join('\n');
  const full = (articles||[]).map((a,i)=>
    '=== บทความที่ '+(i+1)+' ['+a.src+'] '+a.title+'\n'+a.text).join('\n\n');
  const payload   = assertNoPrivateData(
    PROMPT
    + 'ตัวเลขตลาด (ราคาปิดจริง ใช้ตัวเลขชุดนี้เท่านั้น):\n'
    + (nums.length?nums.map(s=>'- '+s).join('\n'):'- ไม่มีข้อมูลราคาในรอบนี้')
    + (full ? '\n\nเนื้อบทความเต็ม — ตัวเลขรายละเอียดอยู่ในนี้ ให้ขุดออกมาใช้:\n'+full : '')
    + '\n\nหัวข้อข่าวอื่นที่ยังไม่ได้อ่านเนื้อเต็ม:\n' + headlines
    + (extra||''));

  const tried=[];
  /* เคยลองขอค้นเว็บกับทุกรุ่น ได้ 429 เหมือนกันหมดสองรอบติด
     สรุปว่ากุญแจฟรีใบนี้ไม่มีโควตาค้นเว็บ จึงไม่ยิงซ้ำให้เสียเวลาอีก 4 ครั้ง
     แต่ยังลองกับรุ่นแรกรุ่นเดียวไว้ เผื่อวันหนึ่ง Google เปิดให้
     ตั้ง BRIEF_SEARCH=off เพื่อปิดสนิท หรือ on เพื่อลองทุกรุ่นเหมือนเดิม */
  const searchMode=process.env.BRIEF_SEARCH||'probe';
  const modes = searchMode==='off' ? [false]
              : searchMode==='on'  ? [true,false]
              : ['probe',false];
  for(const mode of modes){
    const useSearch = mode===true || mode==='probe';
    const list = mode==='probe' ? MODELS.slice(0,1) : MODELS;
    for(const m of list){
      try{
        log('  ลอง '+m+(useSearch?' (ค้นเว็บ)':' (ไม่ค้นเว็บ)'));
        const {body,cites}=await askModel(m,payload,useSearch);
        log('  ✓ ใช้ '+m+' ได้'+(cites.length?' · อ้างอิง '+cites.length+' แหล่ง':''));
        return {body:body.replace(/\*\*/g,'').replace(/^\s*[-*]\s+/gm,''),
                model:m, grounded:useSearch, cites, tried};
      }catch(e){
        tried.push(m+(useSearch?'+search':'')+': '+e.message);
        log('  ✗ '+m+' — '+e.message);
        /* 401/403 คือกุญแจผิดหรือไม่มีสิทธิ์ ลองรุ่นอื่นก็ไม่ช่วย หยุดเลย
           ส่วน 429 "ห้ามหยุด" — ดูเหตุผลข้างล่าง */
        if(e.status===401||e.status===403)
          throw new Error('กุญแจใช้ไม่ได้ (HTTP '+e.status+') — '+tried.join(' · '));
        /* 429 ของ Google ไม่ได้แปลว่า "ใช้หมดทั้งบัญชี" เสมอไป
           โควตาแยกรายรุ่นและแยกตามว่าเปิดค้นเว็บด้วยไหม
           รุ่นที่ไม่มีโควตาฟรีเลยก็ตอบ 429 เหมือนกัน ไม่ใช่ 403
           รอบแรกที่สำเร็จ ใช้ gemini-flash-lite-latest ซึ่งเป็นตัวท้ายสุด
           แปลว่าตัวอื่นใช้ไม่ได้แต่ตัวนั้นใช้ได้จริง
           รอบนี้ผมดันสั่งให้หยุดทันทีที่เจอ 429 ตัวแรก จึงไม่เคยไปถึงตัวที่ใช้ได้
           เป็นบั๊กที่ผมเพิ่งใส่เข้าไปเอง ตอนนี้ให้ไล่ลองต่อจนครบ */
      }
    }
    if(useSearch)log('  ค้นเว็บไม่ได้ทุกรุ่น ถอยไปใช้แบบอ่านหัวข้อข่าวอย่างเดียว');
  }
  throw new Error('เรียก Gemini ไม่สำเร็จทุกรุ่น — '+tried.join(' · '));
}

/* --------------------------------------------------------------- */
/* ---------------------------------------------------------------
   เทียบราคาที่เขียนในบทสรุป กับราคาจริงที่ป้อนเข้าไป
   ดูเฉพาะประโยคที่พูดถึงสินทรัพย์นั้นจริงๆ และเฉพาะเลขหลักร้อยขึ้นไป
   เพราะตัวเลขอย่าง "ดีล 700 ล้านดอลลาร์" ไม่ใช่ราคาสินทรัพย์
   ยอมให้ต่างได้ 0.5% เผื่อการปัดเศษ เกินกว่านั้นถือว่าน่าสงสัย
   --------------------------------------------------------------- */
const ALIAS={
  'S&P 500':['S&P 500','เอสแอนด์พี'], 'Nasdaq':['Nasdaq','แนสแด็ก'],
  'Dow Jones':['Dow Jones','ดาวโจนส์'], 'VIX':['VIX'],
  'ทองคำ':['ทองคำ'], 'น้ำมัน WTI':['WTI','น้ำมันดิบ'],
  'Bitcoin':['Bitcoin','บิตคอยน์','บิทคอยน์'], 'ดัชนีดอลลาร์':['ดัชนีดอลลาร์'],
};
function checkPrices(body,nums){
  const out=[];
  /* แปลงรายการราคาที่ป้อนไป ให้เป็น ชื่อ -> ตัวเลข */
  const real={};
  for(const line of nums){
    const m=line.match(/^(.+?) ปิดที่ ([\d,]+(?:\.\d+)?)/);
    if(m)real[m[1]]=Number(m[2].replace(/,/g,''));
  }
  /* หาตำแหน่งที่เอ่ยถึงสินทรัพย์ทุกตัวก่อน เพื่อใช้เป็นเส้นแบ่ง
     ภาษาไทยไม่มีเครื่องหมายจบประโยค จะตัดเป็นประโยคแบบภาษาอังกฤษไม่ได้
     (ลองแล้วมันตัดแทบทุกคำ ตัวเลขเลยหลุดออกจากช่วงที่ควรตรวจ)
     จึงใช้วิธีดูตั้งแต่ชื่อสินทรัพย์ ไปจนถึงชื่อสินทรัพย์ตัวถัดไปแทน
     ถ้าดูทั้งย่อหน้าจะเตือนผิด เพราะย่อหน้าเดียวมีทั้ง S&P Nasdaq Dow ปนกัน */
  const marks=[];
  for(const [name] of Object.entries(real)){
    for(const k of (ALIAS[name]||[name])){
      let i=-1;
      while((i=body.indexOf(k,i+1))>=0)marks.push({at:i, name, len:k.length});
    }
  }
  marks.sort((a,b)=>a.at-b.at);

  for(let i=0;i<marks.length;i++){
    const m=marks[i], val=real[m.name];
    const stop=Math.min(
      i+1<marks.length?marks[i+1].at:body.length,
      m.at+180);                                /* กันกรณีเอ่ยชื่อครั้งเดียวแล้วเขียนยาว */
    const seg=body.slice(m.at+m.len, stop);

    /* ดูทิศทางของประโยค ไม่ใช่แค่ระยะห่างของตัวเลข
       "ยืนเหนือระดับ 81,000" ตอนราคา 81,533 เป็นเรื่องจริงและเขียนได้
       "ยืนเหนือระดับ 82,000" ตอนราคา 81,533 เป็นเรื่องเท็จ
       ตัวเลขห่างจากราคาจริงพอๆ กัน (0.65% กับ 0.57%)
       ดูระยะห่างอย่างเดียวจึงแยกสองกรณีนี้ไม่ได้ ต้องดูทิศทางเท่านั้น */
    for(const mm of seg.matchAll(
      /(เหนือ|สูงกว่า|ทะลุ|ยืนเหนือ|ต่ำกว่า|ใต้|หลุด|ปิดที่|อยู่ที่)\s*(?:ระดับ\s*)?([\d,]+(?:\.\d+)?)/g)){
      const word=mm[1], n=Number(mm[2].replace(/,/g,''));
      if(!isFinite(n)||n<100)continue;
      if(n>val*10||n<val/10)continue;        /* คนละเรื่อง เช่น มูลค่าดีล */
      const above=/เหนือ|สูงกว่า|ทะลุ/.test(word);
      const below=/ต่ำกว่า|ใต้|หลุด/.test(word);
      if(above&&val<=n)
        out.push(m.name+' เขียนว่าอยู่เหนือ '+mm[2]+' แต่ราคาจริง '+val);
      else if(below&&val>=n)
        out.push(m.name+' เขียนว่าอยู่ต่ำกว่า '+mm[2]+' แต่ราคาจริง '+val);
      else if(!above&&!below&&Math.abs(n-val)/val>0.005)
        out.push(m.name+' เขียนราคา '+mm[2]+' แต่ราคาจริง '+val);
    }
  }
  return [...new Set(out)].slice(0,6);
}

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

  log('อ่านเนื้อบทความเต็ม');
  let articles=[], artFails=[];
  try{
    const r = await fetchArticles(items);
    articles = r.articles; artFails = r.fails;
  }catch(e){
    /* อ่านบทความไม่ได้ไม่ใช่เหตุให้ทิ้งงาน ยังมีหัวข้อข่าวกับราคาให้เขียนได้ */
    log('  อ่านบทความไม่สำเร็จ: '+e.message+' — เขียนจากหัวข้อข่าวแทน');
  }

  log('ส่งให้ Gemini เขียนสรุป ('+secs()+')');
  let W, fixNote='';
  try{
    W = await writeBrief(items, nums, articles);
    /* ถ้าตัวเลขราคาขัดกับของจริง ลองใหม่อีกครั้งโดยชี้จุดที่ผิดให้ชัด
       ถ้ายังผิดอีก จะไปจบที่การทิ้งงานข้างล่าง ไม่ปล่อยขึ้นเว็บ */
    const bad1=checkPrices(W.body,nums);
    if(bad1.length){
      log('  ตัวเลขราคาไม่ตรง ลองใหม่อีกครั้ง: '+bad1.join(' · '));
      fixNote='\n\nสำคัญมาก รอบที่แล้วคุณเขียนตัวเลขผิดดังนี้\n'
        +bad1.map(s=>'- '+s).join('\n')
        +'\nให้ใช้ตัวเลขจากส่วนตัวเลขตลาดแบบตรงตัวเท่านั้น ห้ามสลับหลัก ห้ามปัดเอง';
      const W2=await writeBrief(items, nums, articles, fixNote);
      if(checkPrices(W2.body,nums).length<bad1.length)W=W2;
    }
  }catch(e){
    /* ระบุขั้นตอนให้ชัด ไม่ปล่อยให้ไปโผล่เป็น "ไม่ทราบขั้นตอน" ที่ตัวดักชั้นนอก */
    saveStatus({ok:false, stage:'เรียก Gemini', hasKey:true, keyLength:KEY.length,
      reason:hideKey(e.message), headlines:items.length, prices:nums.length,
      feedsOk:ok, feedsFailed:failed, elapsed:secs()});
    throw e;
  }
  const {body, model, tried, grounded, cites} = W;
  log('ได้บทสรุป '+body.length+' ตัวอักษร'+(grounded?' (ค้นเว็บ)':' (ไม่ได้ค้นเว็บ)'));

  /* ตรวจว่าทำตามข้อห้ามที่เคยหลุดมาแล้วจริงไหม
     ไม่ถึงกับทิ้งงาน แต่ต้องมีร่องรอยไว้ ไม่งั้นคุณภาพจะค่อยๆ เลื่อนกลับโดยไม่มีใครเห็น */
  const warns=[];
  if(/^\s*(สวัสดี|ยินดีต้อนรับ|อรุณสวัสดิ์)/.test(body))warns.push('ขึ้นต้นด้วยคำทักทาย');
  if(/นักลงทุน(จึง)?ควร|ควรติดตามอย่างใกล้ชิด|แนะนำให้/.test(body))warns.push('มีประโยคเชิงแนะนำ');
  if(!/มุมมอง:/.test(body))warns.push('ไม่มีย่อหน้า "มุมมอง:" ที่แยกการตีความออกมา');
  if(/\*\*|^\s*[-*]\s/m.test(body))warns.push('มี markdown ปน');
  if(!/\d/.test(body.split(/\n{2,}/)[0]||''))warns.push('ย่อหน้าแรกไม่มีตัวเลขปิดกำกับ');
  /* ไม่ได้ค้นเว็บ ไม่ใช่ปัญหาอีกต่อไปถ้าอ่านบทความเต็มมาแล้ว
     เพราะสิ่งที่การค้นเว็บให้ ก็คือเนื้อบทความนั่นเอง
     แต่ถ้าทั้งสองอย่างไม่มี ถึงจะเป็นเรื่องจริงจัง */
  if(!grounded&&articles.length<4)
    warns.push('ไม่ได้ค้นเว็บ และอ่านบทความเต็มได้แค่ '+articles.length
      +' บทความ บทสรุปจะตื้นกว่าปกติมาก');

  /* นับความหนาแน่นของตัวเลข เป็นตัวชี้วัดว่า "ลึกจริง" หรือแค่ "ยาว"
     ต้องนับคำว่า เปอร์เซ็นต์ ด้วย ไม่ใช่นับแต่เครื่องหมาย %
     รอบที่แล้วโมเดลเขียนเป็นภาษาไทยทั้งบท ตัวนับจึงรายงานว่าได้ 0 ตัว
     ทั้งที่มีตั้ง 10 ตัว เป็นการเตือนผิดของตัวนับเอง ไม่ใช่บทสรุปแย่ */
  const pcts=(body.match(/\d+(\.\d+)?\s*(%|เปอร์เซ็นต์)/g)||[]).length;
  if(pcts<8)warns.push('มีตัวเลขเปอร์เซ็นต์แค่ '+pcts+' ตัว ถือว่าบางไป');
  if(body.split(/\n{2,}/).length<5)warns.push('ได้แค่ '+body.split(/\n{2,}/).length+' ย่อหน้า');

  /* จับตัวอักษรต่างภาษาที่หลุดมา
     รอบที่แล้วมีอักษรเกาหลีโผล่กลางประโยคไทย ("ความ불ารในฝรั่งเศส")
     เป็นอาการของโมเดลรุ่นเล็กที่หลุดภาษา คนอ่านเจอแล้วจะไม่เชื่อถือทั้งบท */
  const alien=body.match(/[ᄀ-ᇿ가-힯぀-ヿ一-鿿]/g);
  if(alien)warns.push('มีตัวอักษรต่างภาษาหลุดมา '+alien.length+' ตัว: '+[...new Set(alien)].join(''));

  /* ตรวจว่าราคาที่เขียนขัดกับราคาจริงที่ป้อนไปไหม
     รอบที่แล้วเขียนว่า "บิตคอยน์ปิดที่ 81,533 ... ยืนเหนือระดับ 82,000"
     ซึ่งขัดกันเองในประโยคเดียว เพราะไปหยิบตัวเลขจากหัวข้อข่าวมาปนกับราคาจริง
     ตัวเลขผิดแบบนี้อันตรายกว่าเขียนน่าเบื่อ เพราะอ่านแล้วดูน่าเชื่อ */
  const priceWarn=checkPrices(body,nums);
  if(priceWarn.length)warns.push('ตัวเลขน่าสงสัย: '+priceWarn.join(' · '));
  /* ราคาผิดคือเรื่องร้ายแรงกว่าบทสรุปเก่า
     รอบ 20 ต.ค. มันเขียนน้ำมัน WTI ที่ 111.42 ทั้งที่ราคาจริง 101.41
     สลับตัวเลขเฉยๆ แต่คนอ่านไม่มีทางรู้ เพราะทั้งบทดูน่าเชื่อถือ
     ตอนนั้นตัวตรวจจับได้ แต่ผมตั้งให้เตือนอย่างเดียว มันจึงขึ้นเว็บไปแล้ว
     เตือนในไฟล์ที่ไม่มีใครเปิด เท่ากับไม่ได้เตือน
     ต่อไปถ้าแก้ไม่ได้ ให้ทิ้งงานทั้งรอบ ของเก่ายังอยู่และมีป้ายบอกอายุ
     ของเก่าที่รู้ว่าเก่า ปลอดภัยกว่าของใหม่ที่ตัวเลขผิด */

  if(warns.length)log('(เตือนคุณภาพ) '+warns.join(' · '));

  /* ตรวจอีกรอบ "ขาออก" — เผื่อโมเดลถูกป้อนอะไรแปลกมาแล้วสะท้อนกลับ */
  assertNoPrivateData(body);

  /* ด่านสุดท้าย ถ้าตัวเลขราคายังขัดกับของจริงหลังจากให้แก้แล้ว ไม่ปล่อยขึ้นเว็บ
     หน้าเว็บจะยังแสดงบทสรุปเก่าพร้อมป้ายบอกว่าเก่ากี่วันทำการ
     คนอ่านจะรู้ตัวว่ากำลังอ่านของเก่า ซึ่งดีกว่าอ่านของใหม่ที่ราคาผิด */
  if(priceWarn.length){
    saveStatus({ok:false, stage:'ตรวจตัวเลขขาออก', model, grounded:!!grounded,
      articlesRead:articles.length, retried:!!fixNote,
      reason:'ตัวเลขราคาขัดกับข้อมูลจริง ไม่ยอมเผยแพร่: '+priceWarn.join(' · '),
      qualityWarnings:warns, feedsOk:ok, feedsFailed:failed, elapsed:secs()});
    throw new Error('ตัวเลขราคาผิดหลังจากให้แก้แล้ว — '+priceWarn.join(' · ')
      +' · ไม่เผยแพร่ ของเก่ายังอยู่');
  }

  /* แหล่งอ้างอิง
     ถ้าค้นเว็บได้ ใช้ลิงก์บทความจริงที่โมเดลอ้างถึง กดแล้วเจอข่าวนั้นเลย
     ถ้าค้นไม่ได้ ถอยไปใช้ชื่อฟีด RSS แบบเดิม ซึ่งบอกได้แค่ว่ามาจากสำนักไหน */
  let sources;
  if(grounded&&cites.length){
    sources=cites.slice(0,12);
    log('แหล่งอ้างอิงเป็นลิงก์บทความจริง '+sources.length+' แหล่ง');
  }else if(articles.length){
    /* อ่านบทความไหนมา ก็อ้างบทความนั้น กดแล้วเจอข่าวตรงตัว
       ดีกว่าอ้างชื่อฟีดซึ่งกดแล้วไปโผล่หน้ารวมข่าวที่เปลี่ยนไปแล้ว */
    sources=articles.slice(0,12).map(a=>({name:a.title.slice(0,120), url:a.link}));
    log('แหล่งอ้างอิงเป็นลิงก์บทความที่อ่านจริง '+sources.length+' แหล่ง');
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
           articlesRead:articles.length, headlines:items.length }
  };
  writeFileSync(OUT, JSON.stringify(out,null,2));
  saveStatus({ok:true, model, grounded:!!grounded, articlesRead:articles.length,
    articlesFailed:artFails, citedUrls:sources.length, modelsFailed:tried,
    chars:body.length, paragraphs:body.split(/\n{2,}/).length,
    headlines:items.length, prices:nums.length, qualityWarnings:warns,
    feedsOk:ok, feedsFailed:failed, elapsed:secs()});
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
