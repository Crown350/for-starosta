'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const arrays = ['students','teachers','subjects','lessons','works','funds','tpl'];
const objects = ['att','subs','pays','duty','schedule'];
function validState(s) {
  return s && typeof s === 'object' && !Array.isArray(s) &&
    typeof s.group === 'string' && arrays.every(k=>Array.isArray(s[k])) &&
    arrays.every(k=>s[k].every(x=>x && typeof x==='object' && typeof x.id==='string')) &&
    objects.every(k=>s[k] && typeof s[k]==='object' && !Array.isArray(s[k])) &&
    Array.isArray(s.duty.log) && Number.isInteger(s.duty.idx);
}
function createCloud() {
  const keys = [process.env.OWNER_KEY, process.env.DEPUTY_KEY].filter(Boolean);
  if(keys.some(k=>k.length<32)) throw new Error('Ключи должны содержать минимум 32 символа');
  const file = path.resolve(process.env.DATA_DIR || path.join(__dirname,'data'),'state.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {revision:0,data:null};
  if(!Number.isInteger(state.revision) || (state.data && !validState(state.data))) throw new Error('Повреждено хранилище; восстановите резервную копию');
  const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const hash=s=>crypto.createHash('sha256').update(s).digest();
  const authorized=req=>keys.some(k=>crypto.timingSafeEqual(hash(k),hash((req.headers.authorization||'').replace(/^Bearer /,''))));
  return async (req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/'))return false;
    const origin=req.headers.origin;
    const allowed=(process.env.ALLOWED_ORIGIN||'').split(',').filter(Boolean);
    if(origin){
      const same=origin===`http://${req.headers.host}` || origin===`https://${req.headers.host}`;
      if(!same && !allowed.includes(origin)){reply(res,403,{error:'Источник не разрешён'});return true;}
      res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    }
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});res.end();return true;
    }
    if(!['/api/state','/api/session'].includes(url.pathname))return false;
    if(!keys.length){reply(res,503,{error:'На сервере ещё не настроены ключи доступа'});return true;}
    if(!authorized(req)){reply(res,401,{error:'Неверный или отозванный ключ'});return true;}
    if(url.pathname==='/api/session' && req.method==='GET'){reply(res,200,{ok:true,role:'editor'});return true;}
    if(url.pathname==='/api/state' && req.method==='GET'){reply(res,200,state);return true;}
    if(url.pathname!=='/api/state' || req.method!=='PUT'){reply(res,405,{error:'Метод не поддерживается'});return true;}
    let size=0,chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){reply(res,413,{error:'Данные больше 2 МБ'});return true;}chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{reply(res,400,{error:'Неверный JSON'});return true;}
    if(!validState(input.data) || !Number.isInteger(input.revision)){reply(res,400,{error:'Неверная структура данных'});return true;}
    // No await between revision check and atomic rename: one Node process serializes writes.
    if(input.revision!==state.revision){reply(res,409,{error:'Данные изменились на другом устройстве. Загрузите свежую версию.'});return true;}
    const next={revision:state.revision+1,data:input.data,updatedAt:new Date().toISOString()};
    try{
      fs.writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});
      if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');
      fs.renameSync(file+'.tmp',file);state=next;
    }catch{reply(res,500,{error:'Не удалось сохранить на сервере. Изменения остаются на устройстве.'});return true;}
    reply(res,200,{revision:state.revision,updatedAt:state.updatedAt});return true;
  };
}
module.exports={createCloud,validState};
