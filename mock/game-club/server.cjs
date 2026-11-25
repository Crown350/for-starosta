'use strict';
// Development-only loopback server. Never included in site-files.json.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {Engine,ClubError}=require('./engine.cjs');
const {FIXTURES}=require('./economy.cjs');
const {Agreements}=require('./agreements.cjs');
const {getSchedule}=require('../../server.js');
const root=path.resolve(__dirname,'../..'),publicFiles=new Set(require('../../site-files.json'));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.gz':'application/gzip'};
const sha256=value=>crypto.createHash('sha256').update(String(value)).digest();
function lanHosts(port){const hosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);for(const list of Object.values(os.networkInterfaces()))for(const item of list||[])if(item.family==='IPv4'&&!item.internal)hosts.add(item.address+':'+port);return hosts;}
function ensureLocalDevAccessKey(){
  const keyFile=path.join(root,'local-private/game-club/access-key.txt');
  try{
    if(fs.existsSync(keyFile)){
      const existing=fs.readFileSync(keyFile,'utf8').trim();
      if(existing.length>=32)return existing;
    }
  }catch{}
  const created=crypto.randomBytes(24).toString('hex');
  try{
    fs.mkdirSync(path.dirname(keyFile),{recursive:true,mode:0o700});
    fs.writeFileSync(keyFile,created+'\n',{mode:0o600});
  }catch{}
  return created;
}
function createServer({engine=new Engine({file:path.join(root,'local-private/game-club/state.json')}),port=8790,agreements=new Agreements(),allowLan=false,accessKeys=null,allowFixtureLogin=!allowLan}={}){
  const allowedHosts=allowLan?lanHosts(port):new Set(['127.0.0.1:'+port]);
  const configuredKeys=(Array.isArray(accessKeys)?accessKeys:[process.env.OWNER_KEY,process.env.DEPUTY_KEY]).filter(k=>typeof k==='string'&&k.length>=32);
  const sessions=new Map(),accessSessions=new Map(),loginKeys=new Map(),loginLimits=new Map(),accessLimits=new Map(),readLimits=new Map(),agreementLimits=new Map();
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const cookieOf=(cookies,name)=>new RegExp(`\\b${name}=([a-f0-9]{64})\\b`).exec(cookies||'')?.[1]||'';
  const matchLocalKey=candidate=>{
    if(typeof candidate!=='string'||candidate.length<16||candidate.length>256||/[\u0000-\u001f\u007f]/.test(candidate))return '';
    const candidateHash=sha256(candidate);
    const idx=configuredKeys.findIndex(k=>crypto.timingSafeEqual(sha256(k),candidateHash));
    if(idx===-1)return '';
    return idx===1?'demo-two':'demo';
  };
  const state=async user=>{const value=await engine.state(user);return {...value,rooms:value.rooms.map(room=>({...room,members:room.members.map(m=>({...m,termsAccepted:agreements.current(engine,m.user)}))})),legal:agreements.view(engine,user)};};
  return http.createServer(async(req,res)=>{
    try{
      if(!req.headers.host||!allowedHosts.has(req.headers.host))throw new ClubError('INVALID_HOST',403);
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(req.method==='GET'&&url.pathname==='/schedule.json'){
        try{return json(res,200,await getSchedule({}));}catch{}
      }
      if(req.method==='GET'&&url.pathname==='/api/bgtu/schedule'){
        try{
          const data=await getSchedule(Object.fromEntries(url.searchParams.entries()));
          return json(res,200,data);
        }catch(e){
          const status=Number.isInteger(e?.status)&&e.status>=400&&e.status<600?e.status:502;
          return json(res,status,{ok:false,error:e?.message||'Ошибка получения расписания'});
        }
      }
      if(url.pathname.startsWith('/api/game-club/')){
        if(req.headers.origin&&req.headers.origin!==url.origin)throw new ClubError('INVALID_ORIGIN',403);
        if(req.headers['sec-fetch-site']==='cross-site')throw new ClubError('INVALID_ORIGIN',403);
        const now=Date.now();
        const accessCookie=cookieOf(req.headers.cookie,'starosta_access');
        const accessRecord=accessSessions.get(accessCookie);
        const hasAccess=!!(accessRecord&&accessRecord.expires>now);
        if(accessRecord&&!hasAccess)accessSessions.delete(accessCookie);
        const token=cookieOf(req.headers.cookie,'club_session'),session=sessions.get(token);
        const explicitUser=hasAccess&&session?.accessCookie===accessCookie&&session.expires>now?session.user:null;
        const user=explicitUser||(hasAccess?accessRecord.account:null);
        const rateId=token||accessCookie;

        if(url.pathname==='/api/game-club/access'||url.pathname==='/api/game-club/access-logout'){
          if(req.method!=='POST')throw new ClubError('METHOD_NOT_ALLOWED',405);
          const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(key))throw new ClubError('INVALID_KEY',400);
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ClubError('INVALID_CONTENT_TYPE',415);
          let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw new ClubError('BODY_TOO_LARGE',413);}
          let body;try{body=JSON.parse(raw);}catch{throw new ClubError('INVALID_JSON',400);}
          if(url.pathname==='/api/game-club/access-logout'){
            accessSessions.delete(accessCookie);sessions.delete(token);
            res.setHeader('Set-Cookie',['starosta_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0','club_session=; HttpOnly; SameSite=Strict; Path=/api/game-club/; Max-Age=0']);
            return json(res,200,{ok:true,access:false});
          }
          const recent=(accessLimits.get(req.socket.remoteAddress)||[]).filter(t=>t>now-60000);if(recent.length>=20)throw new ClubError('RATE_LIMIT',429);accessLimits.set(req.socket.remoteAddress,[...recent,now]);
          if(!body||typeof body.accessKey!=='string'||Object.keys(body).some(k=>k!=='accessKey'))throw new ClubError('INVALID_COMMAND',400);
          if(!configuredKeys.length)throw new ClubError('ACCESS_KEYS_NOT_CONFIGURED',503);
          const account=matchLocalKey(body.accessKey.trim());
          if(!account)throw new ClubError('ACCESS_KEY_INVALID',401);
          const nextAccess=crypto.randomBytes(32).toString('hex');
          accessSessions.delete(accessCookie);
          sessions.delete(token);
          accessSessions.set(nextAccess,{expires:now+86400000,account});
          res.setHeader('Set-Cookie',`starosta_access=${nextAccess}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
          return json(res,200,{ok:true,access:true,account});
        }

        if(!hasAccess)throw new ClubError('ACCESS_KEY_REQUIRED',401);
        if(url.pathname!=='/api/game-club/session'&&req.headers['x-club-account']&&req.headers['x-club-account']!==user)throw new ClubError('SESSION_CHANGED',401);
        if(req.method==='GET'&&user){const recent=(readLimits.get(rateId)||[]).filter(t=>t>now-60000);if(recent.length>=120)throw new ClubError('RATE_LIMIT',429);readLimits.set(rateId,[...recent,now]);}
        if(req.method==='GET'&&url.pathname==='/api/game-club/state'){
          if(!user)throw new ClubError('UNAUTHORIZED',401);return json(res,200,await state(user));
        }
        if(req.method==='GET'&&url.pathname==='/api/game-club/recipients'){
          if(!user)throw new ClubError('UNAUTHORIZED',401);if(!agreements.current(engine,user))throw new ClubError('TERMS_REQUIRED',403);return json(res,200,await engine.search(user,url.searchParams.get('q')));
        }
        if(req.method!=='POST')throw new ClubError('METHOD_NOT_ALLOWED',405);
        const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(key))throw new ClubError('INVALID_KEY',400);
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ClubError('INVALID_CONTENT_TYPE',415);
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw new ClubError('BODY_TOO_LARGE',413);}
        let body;try{body=JSON.parse(raw);}catch{throw new ClubError('INVALID_JSON',400);}
        if(url.pathname==='/api/game-club/session'){
          if(!allowFixtureLogin||allowLan)throw new ClubError('NOT_FOUND',404);
          const recent=(loginLimits.get(req.socket.remoteAddress)||[]).filter(t=>t>now-60000);if(recent.length>=20)throw new ClubError('RATE_LIMIT',429);loginLimits.set(req.socket.remoteAddress,[...recent,now]);
          if(!body||!Object.hasOwn(FIXTURES,body.account)||body.password!=='club-demo'||Object.keys(body).some(k=>!['account','password'].includes(k)))throw new ClubError('UNAUTHORIZED',401);
          const loginKey=accessCookie+':'+key;
          const previous=loginKeys.get(loginKey);if(previous&&previous.user!==body.account)throw new ClubError('KEY_CONFLICT');
          const t=previous?.token||crypto.randomBytes(32).toString('hex');sessions.set(t,{user:body.account,accessCookie,expires:now+86400000});loginKeys.set(loginKey,{user:body.account,token:t});
          res.setHeader('Set-Cookie',`club_session=${t}; HttpOnly; SameSite=Strict; Path=/api/game-club/; Max-Age=86400`);return json(res,200,await state(body.account));
        }
        if(url.pathname==='/api/game-club/logout'){
          sessions.delete(token);
          const cookies=['club_session=; HttpOnly; SameSite=Strict; Path=/api/game-club/; Max-Age=0'];
          if(body?.revokeAccess===true){accessSessions.delete(accessCookie);cookies.push('starosta_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
          res.setHeader('Set-Cookie',cookies);return json(res,200,{ok:true});
        }
        if(!user)throw new ClubError('UNAUTHORIZED',401);
        if(url.pathname==='/api/game-club/agreement'||url.pathname==='/api/game-club/data-consent'){
          const recent=(agreementLimits.get(user)||[]).filter(t=>t>now-60000);if(recent.length>=20)throw new ClubError('RATE_LIMIT',429);agreementLimits.set(user,[...recent,now]);
          return json(res,200,await agreements.record(engine,user,key,body,url.pathname.endsWith('/agreement')?'terms':'consent'));
        }
        if(url.pathname==='/api/game-club/command'){if(!agreements.current(engine,user))throw new ClubError('TERMS_REQUIRED',403);if(body.type==='roomStart'&&engine.data.rooms[body.code]?.members.some(m=>!agreements.current(engine,m.user)))throw new ClubError('TERMS_REQUIRED',403);const result=await engine.command(user,key,body);result.state.legal=agreements.view(engine,user);result.state.rooms=result.state.rooms.map(room=>({...room,members:room.members.map(m=>({...m,termsAccepted:agreements.current(engine,m.user)}))}));return json(res,200,result);}
        throw new ClubError('NOT_FOUND',404);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new ClubError('METHOD_NOT_ALLOWED',405);
      if(url.pathname==='/club'||url.pathname==='/v2'){res.writeHead(308,{Location:url.pathname+'/'+(url.search||'')});return res.end();}
      let file=decodeURIComponent(url.pathname).replace(/^\//,'');if(!file||file.endsWith('/'))file+='index.html';
      if(!publicFiles.has(file))throw new ClubError('NOT_FOUND',404);
      const data=fs.readFileSync(path.join(root,file));res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){const known=e instanceof ClubError||(e.code&&Number.isInteger(e.status));json(res,known?e.status:500,{error:known?e.code:'INTERNAL_ERROR'});}
  });
}
if(require.main===module){
  const port=8790,allowLan=process.argv.includes('--lan')||process.env.HOST==='0.0.0.0'||process.env.CLUB_LAN==='1',bindHost=allowLan?'0.0.0.0':'127.0.0.1';
  const engine=new Engine({file:path.join(root,'local-private/game-club/state.json')});
  const accessKeys=[ensureLocalDevAccessKey()];
  createServer({engine,port,allowLan,accessKeys,allowFixtureLogin:process.argv.includes('--fixtures')}).listen(port,bindHost,()=>{
    console.log(`Game club mock + site: http://127.0.0.1:${port}/club/ — demo, demo-two, demo-three / club-demo`);
    console.log('Access key file: local-private/game-club/access-key.txt');
    if(allowLan)for(const h of lanHosts(port))if(!h.startsWith('127.0.0.1:')&&!h.startsWith('localhost:'))console.log(`LAN: http://${h}/club/`);
  });
  setInterval(()=>engine.tick().catch(()=>console.error('Mock maintenance failed')),1000).unref();
}
module.exports={createServer};
