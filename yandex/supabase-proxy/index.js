'use strict';
const https=require('node:https');
const UPSTREAM='https://piwxslgxwmdrehnomymt.supabase.co';
const ALLOWED=['apikey','authorization','content-type','accept','prefer','range','range-unit','accept-profile','content-profile','if-match','if-none-match','x-client-info'];
const CORS={'Access-Control-Allow-Origin':'https://crown350.github.io','Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':[...ALLOWED,'x-supabase-authorization'].join(', '),'Access-Control-Expose-Headers':'content-range, range-unit, retry-after, x-starosta-proxy','Vary':'Origin','Cache-Control':'no-store'};
const fail=(status,message)=>({statusCode:status,headers:{...CORS,'Content-Type':'application/json'},body:JSON.stringify({message}),isBase64Encoded:false});
function send(url,options,body){
 return new Promise((resolve,reject)=>{
  const req=https.request(url,options,res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>3*1024*1024){res.destroy();req.destroy(new Error('Response too large'));}else chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });
  const timer=setTimeout(()=>req.destroy(new Error('Upstream timeout')),18000);
  req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(body);
 });
}
async function proxy(event={},transport=send){
 const method=String(event.httpMethod||'').toUpperCase();
 if(method==='OPTIONS')return {statusCode:204,headers:CORS,body:''};
 if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))return fail(405,'Метод не поддерживается');
 // Direct Cloud Functions events have no path field: transport the relative URI as ?path=.
 const path=event.queryStringParameters?.path;
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\\#\r\n]/.test(path))return fail(400,'Требуется относительный путь Supabase');
 const url=new URL(path,UPSTREAM);
 if(url.origin!==UPSTREAM)return fail(400,'Недопустимый адрес');
 const incoming=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const headers={};for(const name of ALLOWED)if(incoming[name]!==undefined)headers[name]=incoming[name];
 // Yandex strips Authorization before invoking a function. Restore only the caller's value.
 if(incoming['x-supabase-authorization'])headers.authorization=incoming['x-supabase-authorization'];
 const body=['GET','HEAD'].includes(method)?undefined:Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');
 try{
  const response=await transport(url,{method,headers},body);
  const out={},multiValueHeaders={};
  const omit=new Set(['connection','keep-alive','transfer-encoding','te','trailer','upgrade','proxy-authenticate','proxy-authorization','via','content-length']);
  for(const [name,value] of Object.entries(response.headers)){
   if(omit.has(name.toLowerCase())||name.toLowerCase().startsWith('access-control-')||value===undefined)continue;
   if(Array.isArray(value))multiValueHeaders[name]=value;else out[name]=String(value);
  }
  // Never cache journal responses. Preserve upstream status and bytes, including errors.
  delete out['cache-control'];delete out.vary;
  return {statusCode:response.status,headers:{...out,...CORS,'X-Starosta-Proxy':'upstream'},multiValueHeaders,body:method==='HEAD'?'':response.body.toString('base64'),isBase64Encoded:true};
 }catch{return fail(502,'Не удалось связаться с Supabase через Yandex');}
}
exports.handler=event=>proxy(event);
exports.proxy=proxy;
