/* ==================================================================
   sync.js — ซิงค์ข้อมูลส่วนตัวข้ามเครื่องผ่าน Supabase

   หลักคิดด้านความปลอดภัย
   --------------------------------------------------------------
   anon key ของ Supabase เป็นกุญแจ "สาธารณะ" โดยธรรมชาติ มันต้องฝัง
   อยู่ในโค้ดหน้าเว็บ ใครเปิดดูซอร์สก็เห็น  และ repo นี้เป็นสาธารณะ
   ถ้าเก็บพอร์ตเป็นข้อความธรรมดา ใครเจอคีย์ก็อ่านพอร์ตได้ทันที

   จึง *เข้ารหัสฝั่งเบราว์เซอร์ก่อนส่ง* ด้วยรหัสผ่านที่คุณตั้งเอง
   - Supabase เห็นแต่ก้อนข้อมูลที่อ่านไม่ออก
   - รหัสผ่านไม่เคยถูกส่งออกจากเครื่อง ไม่มีใครกู้ให้ได้ถ้าลืม
   - ชื่อแถวเป็นแฮชของรหัสผ่าน คนอื่นจึงหาแถวของคุณไม่เจอด้วยซ้ำ

   แหล่งความจริงยังเป็น localStorage ในเครื่อง  คลาวด์เป็นแค่ "สำเนา"
   ถ้าคลาวด์ล่มหรือรหัสผิด หน้าเว็บยังทำงานได้ตามปกติทุกอย่าง
   ================================================================== */
(function(root){
'use strict';

var CFG='sync_cfg_v1';          /* ที่อยู่ + anon key + ชื่อเครื่อง (ไม่เก็บรหัสผ่านไว้ที่นี่) */
var PASS='sync_pass_v1';        /* รหัสผ่าน เก็บแยกเพื่อให้ลบทิ้งง่ายเวลาใช้เครื่องคนอื่น */
var MARK='sync_mark_v1';        /* เวลาที่ซิงค์ล่าสุด ใช้ตัดสินว่าใครใหม่กว่า */

/* กุญแจที่ซิงค์ — ต้องตรงกับที่หน้าอื่นใช้จริง
   ไม่รวม dash_theme / dash_mode เพราะธีมควรเป็นของแต่ละเครื่อง */
var KEYS=['pro_pf','pro_px','pro_tr','pro_sec','pro_hist','pro_cur','pro_fx',
  'pro_wl','pro_al','pro_er','pro_ytgt','pro_dcaw',
  'bt_trades_v1','bt_cfg_v1','wl_v1'];

var enc=new TextEncoder(), dec=new TextDecoder();
function b64(buf){ var b='',a=new Uint8Array(buf);
  for(var i=0;i<a.length;i++)b+=String.fromCharCode(a[i]); return btoa(b) }
function unb64(s){ var b=atob(s),a=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i); return a }

function cfg(){ try{ return JSON.parse(localStorage.getItem(CFG))||null }catch(e){ return null } }
function pass(){ try{ return localStorage.getItem(PASS)||null }catch(e){ return null } }
function ready(){ var c=cfg(); return !!(c&&c.url&&c.key&&pass()) }

/* สร้างกุญแจเข้ารหัสจากรหัสผ่าน
   PBKDF2 รอบเยอะเพื่อให้เดารหัสทีละตัวช้าลงมาก */
async function deriveKey(p,saltStr){
  var base=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:enc.encode(saltStr),iterations:250000,hash:'SHA-256'},
    base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
/* ชื่อแถว = แฮชของรหัสผ่าน (คนละ salt กับกุญแจเข้ารหัส)
   ใช้แฮชแทนชื่อจริง เพื่อไม่ให้ชื่อแถวบอกใบ้ว่าเป็นของใคร */
async function rowId(p){
  var h=await crypto.subtle.digest('SHA-256',enc.encode('row:'+p));
  return b64(h).replace(/[^A-Za-z0-9]/g,'').slice(0,32);
}

async function encrypt(obj,p){
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var k=await deriveKey(p,'vault-v1');
  var ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,enc.encode(JSON.stringify(obj)));
  return {v:1, iv:b64(iv), ct:b64(ct)};
}
async function decrypt(box,p){
  if(!box||box.v!==1||!box.iv||!box.ct)throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
  var k=await deriveKey(p,'vault-v1');
  var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv)},k,unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

function snapshot(){
  var d={};
  KEYS.forEach(function(k){ var v=null; try{ v=localStorage.getItem(k) }catch(e){}
    if(v!=null)d[k]=v });
  return d;
}
function restore(d){
  var n=0;
  Object.keys(d||{}).forEach(function(k){
    if(KEYS.indexOf(k)<0)return;          /* ไม่เขียนกุญแจแปลกปลอม */
    try{ localStorage.setItem(k,d[k]); n++ }catch(e){}
  });
  return n;
}
/* ลายนิ้วมือของข้อมูล ใช้ดูว่าเปลี่ยนจริงไหม จะได้ไม่ส่งซ้ำทุกวินาที */
function fingerprint(d){
  var s=Object.keys(d).sort().map(function(k){return k+':'+d[k].length}).join('|');
  var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0 }
  return h+'/'+s.length;
}

async function api(path,opt){
  var c=cfg(); if(!c)throw new Error('ยังไม่ได้ตั้งค่า');
  opt=opt||{};
  var r=await fetch(c.url.replace(/\/$/,'')+'/rest/v1/'+path,{
    method:opt.method||'GET',
    headers:Object.assign({
      'apikey':c.key, 'Authorization':'Bearer '+c.key,
      'Content-Type':'application/json'}, opt.headers||{}),
    body:opt.body?JSON.stringify(opt.body):undefined
  });
  if(!r.ok){
    var t=''; try{ t=(await r.text()).slice(0,180) }catch(e){}
    throw new Error('Supabase ตอบ HTTP '+r.status+(t?' — '+t:''));
  }
  return r.status===204?null:r.json();
}

/* ---- ดึงจากคลาวด์ ---- */
async function pull(){
  if(!ready())throw new Error('ยังไม่ได้ตั้งค่าซิงค์');
  var p=pass(), id=await rowId(p);
  var rows=await api('vault?id=eq.'+id+'&select=data,updated_at');
  if(!rows||!rows.length)return {found:false};
  var box=rows[0].data, at=rows[0].updated_at;
  var data=await decrypt(box,p);     /* รหัสผิดจะโยน error ตรงนี้ */
  return {found:true, data:data, at:at};
}

/* ---- ส่งขึ้นคลาวด์ ---- */
async function push(){
  if(!ready())throw new Error('ยังไม่ได้ตั้งค่าซิงค์');
  var p=pass(), id=await rowId(p), snap=snapshot();
  if(!Object.keys(snap).length)throw new Error('เครื่องนี้ไม่มีข้อมูลให้ส่ง');
  var box=await encrypt(snap,p);
  var c=cfg();
  await api('vault',{method:'POST',
    headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:[{id:id,data:box,updated_at:new Date().toISOString(),
           device:(c&&c.device)||'ไม่ระบุ'}]});
  try{ localStorage.setItem(MARK,JSON.stringify(
    {at:new Date().toISOString(), fp:fingerprint(snap)})) }catch(e){}
  return {sent:Object.keys(snap).length};
}

/* ---- ซิงค์อัตโนมัติตอนเปิดหน้า ----
   กติกา: ใครแก้ทีหลังคนนั้นชนะ แต่ถ้าทั้งสองฝั่งเปลี่ยนตั้งแต่ซิงค์ครั้งก่อน
   จะ "ไม่ตัดสินใจแทน" เพราะเลือกผิดแล้วข้อมูลหายกู้ไม่ได้ */
async function auto(){
  if(!ready())return {skip:'ยังไม่ได้ตั้งค่า'};
  var mark=null; try{ mark=JSON.parse(localStorage.getItem(MARK)) }catch(e){}
  var snap=snapshot(), fpNow=fingerprint(snap);
  var localChanged=!mark||mark.fp!==fpNow;

  var res=await pull();
  if(!res.found){
    if(!Object.keys(snap).length)return {state:'ว่างทั้งสองฝั่ง'};
    await push();
    return {state:'ส่งขึ้นคลาวด์ครั้งแรก'};
  }
  var remoteNewer=!mark||(res.at&&Date.parse(res.at)>Date.parse(mark.at||0));

  if(remoteNewer&&localChanged)
    return {state:'ขัดกัน', conflict:true, remoteAt:res.at,
            msg:'ทั้งเครื่องนี้และคลาวด์เปลี่ยนไปคนละทาง เลือกเองว่าจะเอาฝั่งไหน'};

  if(remoteNewer){
    var n=restore(res.data);
    try{ localStorage.setItem(MARK,JSON.stringify(
      {at:res.at, fp:fingerprint(snapshot())})) }catch(e){}
    return {state:'ดึงจากคลาวด์', keys:n, reload:true};
  }
  if(localChanged){ await push(); return {state:'ส่งขึ้นคลาวด์'} }
  return {state:'ตรงกันอยู่แล้ว'};
}

root.SYNC={
  KEYS:KEYS, CFG:CFG, PASS:PASS, MARK:MARK,
  ready:ready, cfg:cfg,
  setCfg:function(o){ localStorage.setItem(CFG,JSON.stringify(o)) },
  setPass:function(p){ localStorage.setItem(PASS,p) },
  forget:function(){ localStorage.removeItem(PASS); localStorage.removeItem(MARK) },
  snapshot:snapshot, restore:restore, fingerprint:fingerprint,
  encrypt:encrypt, decrypt:decrypt, rowId:rowId,
  pull:pull, push:push, auto:auto
};
})(typeof globalThis!=='undefined'?globalThis:this);
