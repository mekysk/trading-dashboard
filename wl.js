/* ==================================================================
   wl.js — รายชื่อหุ้นที่ติดตาม ชุดเดียวใช้ร่วมกันทุกหน้า

   เดิมแต่ละหน้าเก็บรายชื่อของตัวเอง (ev_wl_v1, pro_wl, และบางหน้าฝังไว้ในโค้ด)
   ทำให้ต้องกรอกชื่อหุ้นซ้ำหลายรอบ และแก้ที่หนึ่งแล้วอีกที่ไม่เปลี่ยนตาม
   ไฟล์นี้รวมให้เหลือคีย์เดียว และย้ายของเก่ามาให้อัตโนมัติครั้งแรกที่เปิด

   ต้องโหลดไฟล์นี้ "ก่อน" สคริปต์ของหน้า ไม่งั้นหน้าจะเรียกใช้ตอนที่ยังไม่มี
   ================================================================== */
(function(root){
'use strict';
var KEY='wl_v1';
var OLD=['ev_wl_v1','pro_wl'];      /* คีย์เก่าที่เคยใช้ */
var DEFAULT=['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA'];

function norm(a){
  var seen={}, out=[];
  (a||[]).forEach(function(x){
    var s=String(x||'').trim().toUpperCase();
    if(!s||!/^[A-Z][A-Z.0-9]{0,5}$/.test(s))return;
    if(seen[s])return;
    seen[s]=1; out.push(s);
  });
  return out;
}
function readKey(k){
  try{
    var v=JSON.parse(localStorage.getItem(k));
    return Array.isArray(v)?v:null;
  }catch(e){ return null }
}
/* ย้ายของเก่ามารวมครั้งเดียว — รวมทุกคีย์เข้าด้วยกัน ไม่ทิ้งของใคร
   และไม่ลบคีย์เก่า เผื่อผู้ใช้ยังเปิดหน้าเวอร์ชันเก่าค้างอยู่ */
function migrate(){
  var merged=[];
  OLD.forEach(function(k){
    var v=readKey(k);
    if(v)merged=merged.concat(v);
  });
  merged=norm(merged);
  if(merged.length){
    try{ localStorage.setItem(KEY,JSON.stringify(merged)) }catch(e){}
    return merged;
  }
  return null;
}

var WL={
  KEY:KEY,
  /* คืนรายชื่อปัจจุบัน — ถ้ายังไม่เคยมี จะย้ายของเก่ามาให้ หรือใช้ค่าตั้งต้น */
  get:function(useDefault){
    var v=readKey(KEY);
    if(v)return norm(v);
    var m=migrate();
    if(m)return m;
    return useDefault===false?[]:DEFAULT.slice();
  },
  /* คืนเฉพาะที่ผู้ใช้ตั้งไว้จริง ไม่เติมค่าตั้งต้นให้
     ใช้ตอนที่ต้องแยกให้ออกว่า "ยังไม่ได้ตั้ง" กับ "ตั้งเป็นค่าว่าง" */
  raw:function(){ return this.get(false) },
  set:function(arr){
    var v=norm(arr);
    try{ localStorage.setItem(KEY,JSON.stringify(v)) }catch(e){}
    return v;
  },
  add:function(input){
    var add=Array.isArray(input)?input:String(input||'').split(/[\s,]+/);
    return this.set(this.get().concat(add));
  },
  remove:function(sym){
    var s=String(sym||'').trim().toUpperCase();
    return this.set(this.get().filter(function(x){ return x!==s }));
  },
  isDefault:function(){ return readKey(KEY)==null },
  DEFAULT:DEFAULT.slice()
};
root.WATCHLIST=WL;
})(typeof globalThis!=='undefined'?globalThis:this);
