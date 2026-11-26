'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {Engine,selectReward}=require('../mock/game-club/engine.cjs'),{config,validate}=require('../mock/game-club/config.cjs'),{createServer}=require('../mock/game-club/server.cjs');
const key=()=>crypto.randomUUID(),cmd=(e,type,rest={},id='demo',k=key())=>e.command(id,k,{type,...rest});
const code=c=>e=>e.code===c;
test('ticket, guaranteed credit, atomic purchase and insufficient funds',async()=>{
  const e=new Engine({draw:()=>0});await cmd(e,'ticket');assert.equal((await cmd(e,'spin')).state.balance,50);
  const bought=await cmd(e,'buy',{itemId:'theme-moss'});assert.equal(bought.state.balance,10);assert.ok(bought.state.owned.includes('theme-moss'));
  await assert.rejects(cmd(e,'buy',{itemId:'frame-orbit'}),code('INSUFFICIENT_SPARKS'));assert.equal((await e.state('demo')).balance,10);
  assert.ok(!(await e.state('demo')).owned.includes('frame-orbit'));await assert.rejects(cmd(e,'spin'),code('NO_TICKET'));
});
test('same idempotency key replays receipt once; changed body conflicts',async()=>{
  const e=new Engine({draw:()=>0}),k=key();await cmd(e,'ticket');const a=await cmd(e,'spin',{},'demo',k),b=await cmd(e,'spin',{},'demo',k);
  assert.deepEqual(a.receipt,b.receipt);assert.equal(b.replayed,true);assert.equal(b.state.balance,50);assert.equal(b.state.history.filter(h=>h.type==='spin').length,1);
  await assert.rejects(cmd(e,'buy',{itemId:'theme-moss'},'demo',k),code('KEY_CONFLICT'));
});
test('concurrent purchase serializes debit and prevents duplicate ownership',async()=>{
  const e=new Engine({draw:()=>9000});await cmd(e,'ticket');await cmd(e,'spin');const results=await Promise.allSettled([cmd(e,'buy',{itemId:'theme-moss'}),cmd(e,'buy',{itemId:'theme-moss'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ALREADY_OWNED');assert.equal((await e.state('demo')).balance,50);
});
test('forged price, reward, account, category and prototype event cannot grant points',async()=>{
  const e=new Engine();for(const input of [{type:'buy',itemId:'theme-moss',price:0},{type:'spin',result:'aurora'},{type:'ticket',account:'demo-two'},{type:'claim',eventId:'constructor'},{type:'predict',eventId:{}},{type:'buy',itemId:'javascript:alert(1)'},{type:'__proto__'},{type:['ticket']}])await assert.rejects(e.command('demo',key(),input),code('INVALID_COMMAND'));
  assert.equal((await e.state('demo')).balance,0);await assert.rejects(cmd(e,'unequip',{category:'__proto__'}),code('INVALID_CATEGORY'));
});
test('users and ownership are isolated, including reuse of another user key',async()=>{
  const e=new Engine({draw:()=>0}),k=key();await cmd(e,'ticket',{},'demo',k);await cmd(e,'spin');await cmd(e,'buy',{itemId:'theme-moss'});await cmd(e,'equip',{itemId:'theme-moss'});
  const other=await e.state('demo-two');assert.equal(other.balance,0);assert.deepEqual(other.owned,[]);assert.deepEqual(other.equipped,{});await assert.rejects(cmd(e,'equip',{itemId:'theme-moss'},'demo-two'),code('NOT_OWNED'));
  await cmd(e,'ticket',{},'demo-two',k);assert.equal((await e.state('demo-two')).tickets,1);await assert.rejects(e.state('someone'),code('UNAUTHORIZED'));
});
test('exact probability boundaries and rare guarantee on attempt eight',async()=>{
  assert.equal(selectReward(config.rewards,0).id,'glow');assert.equal(selectReward(config.rewards,6999).id,'glow');assert.equal(selectReward(config.rewards,7000).id,'flare');assert.equal(selectReward(config.rewards,9499).id,'flare');assert.equal(selectReward(config.rewards,9500).id,'aurora');assert.equal(selectReward(config.rewards,9999).id,'aurora');
  for(const draw of [-1,10000,NaN,.1])assert.throws(()=>selectReward(config.rewards,draw));
  let time=100000;const e=new Engine({now:()=>time,draw:()=>0});for(let i=0;i<8;i++){await cmd(e,'ticket');const before=await e.state('demo');assert.equal(before.probabilities.reduce((n,r)=>n+r.probability,0),1);if(i===7){assert.equal(before.guaranteed,true);assert.equal(before.probabilities.find(r=>r.rare).probability,1);}const r=await cmd(e,'spin');assert.equal(r.receipt.reward.rare,i===7);time+=86400000;}
  const s=await e.state('demo');assert.equal(s.misses,0);assert.ok(s.owned.includes('badge-aurora'));
});
test('clock controls tickets and decorative streak; no expiration or double reward',async()=>{
  let time=0;const e=new Engine({now:()=>time});await cmd(e,'ticket');await assert.rejects(cmd(e,'ticket'),code('TICKET_NOT_READY'));time=86400000-1;await assert.rejects(cmd(e,'ticket'),code('TICKET_NOT_READY'));time++;assert.equal((await cmd(e,'ticket')).state.streak,2);time+=3*86400000;const s=(await cmd(e,'ticket')).state;assert.equal(s.streak,1);assert.equal(s.tickets,3);
});
test('prediction is free, result hidden until close, claim once and no client result',async()=>{
  let time=1200000;const e=new Engine({now:()=>time});const s=await e.state('demo'),event=s.events[0];assert.equal(event.result,null);
  await cmd(e,'predict',{eventId:event.id,choice:0});assert.equal((await e.state('demo')).balance,0);await assert.rejects(cmd(e,'predict',{eventId:event.id,choice:1}),code('ALREADY_PREDICTED'));await assert.rejects(cmd(e,'claim',{eventId:event.id}),code('EVENT_OPEN'));
  time=event.closesAt;assert.notEqual((await e.state('demo')).events[0].result,null);const k=key(),a=await cmd(e,'claim',{eventId:event.id},'demo',k);assert.ok([10,25].includes(a.receipt.delta));assert.equal((await cmd(e,'claim',{eventId:event.id},'demo',k)).state.balance,a.state.balance);await assert.rejects(cmd(e,'claim',{eventId:event.id}),code('ALREADY_CLAIMED'));
});
test('crash before commit keeps ticket and balance; lost response replays after restart',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-')),file=path.join(dir,'state.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let e=new Engine({file,draw:()=>0});await cmd(e,'ticket');const realWrite=e.write;e.write=()=>{throw Error('disk unavailable');};const k=key();await assert.rejects(cmd(e,'spin',{},'demo',k),/disk unavailable/);assert.equal(e.data.users.demo.tickets,1);assert.equal(e.data.users.demo.balance,0);e.write=realWrite;
  const a=await cmd(e,'spin',{},'demo',k);e=new Engine({file,draw:()=>9999});const b=await cmd(e,'spin',{},'demo',k);assert.deepEqual(a.receipt,b.receipt);assert.equal(b.state.balance,50);assert.equal(b.state.tickets,0);
});
test('rate limit blocks new operations, but replay remains available',async()=>{
  const e=new Engine({draw:()=>0});await cmd(e,'ticket');await cmd(e,'spin');await cmd(e,'buy',{itemId:'theme-moss'});const k=key();await cmd(e,'equip',{itemId:'theme-moss'},'demo',k);for(let i=0;i<26;i++)await cmd(e,'equip',{itemId:'theme-moss'});await assert.rejects(cmd(e,'equip',{itemId:'theme-moss'}),code('RATE_LIMIT'));assert.equal((await cmd(e,'equip',{itemId:'theme-moss'},'demo',k)).replayed,true);
});
test('validated configuration rejects unsafe URLs, markup, negative prices and odds',()=>{
  for(const mutation of [c=>c.catalogue[0].price=-1,c=>c.catalogue[0].preview='<img src=x onerror=alert(1)>',c=>c.catalogue[0].url='https://evil.example',c=>c.catalogue[0].effect='javascript:alert(1)',c=>c.rewards[0].weight++,c=>c.catalogue.push(c.catalogue[0]),c=>c.pity=0,c=>c.rewards[0].sparks=-1]){const c=structuredClone(config);mutation(c);assert.throws(()=>validate(c));}
});
test('HTTP authentication, session switch, private paths, cross-origin and spoofed fields',async t=>{
  const accessKey='owner-test-key-'+'x'.repeat(32);
  const engine=new Engine({draw:()=>0}),server=createServer({engine,port:0,accessKeys:[accessKey]});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  // createServer uses a fixed permitted host; explicitly reconstruct on the allocated port.
  await new Promise(r=>server.close(r));const live=createServer({engine,port,accessKeys:[accessKey]});await new Promise(r=>live.listen(port,'127.0.0.1',r));t.after(()=>new Promise(r=>live.close(r)));
  const base='http://127.0.0.1:'+port;const jar={};const cookieStr=()=>Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ');
  const saveCookies=res=>{const list=typeof res.headers.getSetCookie==='function'?res.headers.getSetCookie():[res.headers.get('set-cookie')].filter(Boolean);for(const raw of list){const [kv]=raw.split(';');const [k,v]=kv.split('=');if(v)jar[k]=v;else delete jar[k];}};
  const call=(route,body,extra={})=>fetch(base+'/api/game-club/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...(cookieStr()?{Cookie:cookieStr()}:{}),...extra},body:body?JSON.stringify(body):undefined});
  assert.equal((await call('state')).status,401);assert.equal((await call('session',{account:'demo',password:'club-demo'})).status,401);
  const access=await call('access',{accessKey});assert.equal(access.status,200);saveCookies(access);
  const directState=await call('state');assert.equal(directState.status,200);assert.equal((await directState.json()).account,'demo');
  assert.equal((await call('session',{account:'demo',password:'wrong'})).status,401);
  const login=await call('session',{account:'demo',password:'club-demo'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);saveCookies(login);
  const legal=(await login.json()).legal;assert.equal((await call('agreement',{version:legal.version,hash:legal.hash,age18:true,accept:true})).status,200);
  assert.equal((await call('command',{type:'ticket'},{Origin:'https://evil.example'})).status,403);assert.equal((await call('command',{type:'ticket',balance:99999})).status,400);
  assert.equal((await call('command',{type:'ticket'},{'X-Club-Account':'demo-two'})).status,401);assert.equal((await call('command',{type:'ticket'},{'X-Club-Account':'demo'})).status,200);
  assert.equal((await fetch(base+'/local-private/game-club/state.json')).status,404);assert.equal((await fetch(base+'/mock/game-club/config.cjs')).status,404);
  assert.equal((await call('access-logout',{})).status,200);delete jar.starosta_access;delete jar.club_session;assert.equal((await call('state')).status,401);
});
test('allowLan permits local interface host and same-origin requests while blocking spoofed host/origin',async t=>{
  const accessKey='owner-test-key-'+'y'.repeat(32);
  const engine=new Engine({draw:()=>0}),probe=createServer({engine,port:0,allowLan:true,accessKeys:[accessKey]});await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;
  await new Promise(r=>probe.close(r));const live=createServer({engine,port,allowLan:true,accessKeys:[accessKey]});await new Promise(r=>live.listen(port,'127.0.0.1',r));t.after(()=>new Promise(r=>live.close(r)));
  const access=await fetch(`http://localhost:${port}/api/game-club/access`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(),Origin:`http://localhost:${port}`},body:JSON.stringify({accessKey})});
  assert.equal(access.status,200);const accessCookie=access.headers.get('set-cookie').split(';')[0];
  const login=await fetch(`http://localhost:${port}/api/game-club/session`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(),Origin:`http://localhost:${port}`,Cookie:accessCookie},body:JSON.stringify({account:'demo',password:'club-demo'})});
  assert.equal(login.status,404);
  const state=await fetch(`http://localhost:${port}/api/game-club/state`,{headers:{Cookie:accessCookie}});
  assert.equal(state.status,200);
  assert.equal((await state.json()).account,'demo');
  const evilOrigin=await fetch(`http://localhost:${port}/api/game-club/session`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(),Origin:'https://evil.example',Cookie:accessCookie},body:JSON.stringify({account:'demo',password:'club-demo'})});
  assert.equal(evilOrigin.status,403);
  const redir=await fetch(`http://127.0.0.1:${port}/club`,{redirect:'manual'});
  assert.equal(redir.status,308);assert.equal(redir.headers.get('location'),'/club/');
});
test('club DOM uses text nodes for hostile values and no unsafe URLs or monetary mechanisms',()=>{
  const source=fs.readFileSync(require.resolve('../club/app.js'),'utf8');assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML|Math\.random/);assert.doesNotMatch(source,/казино|ставк|букмекер|депозит|вывод денег|джекпот|stripe|paypal|bitcoin|payment|checkout/i);
  assert.deepEqual([...source.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)].map(m=>m[1]),['starosta-ui-mode','starosta-ui-mode']);
  // Execute the real renderer against a small DOM, not a second implementation.
  class Node{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;this.attrs={};}append(...n){this.children.push(...n);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}querySelector(){return null;}get textContent(){return this.text??this.children.map(n=>n.textContent).join(' ');}set textContent(s){this.text=String(s);} }
  const body=new Node('body');body.dataset.screen='gameclub';const head=new Node('head'),root=new Node('main'),hostile='<img src=x onerror=alert(1)>';
  const s={account:hostile,catalogue:[{id:'bad',name:hostile,preview:'javascript:alert(1)',category:'theme',effect:'moss',price:1,rarity:'Редкий'}],equipped:{},owned:[],events:[],history:[{reason:hostile,delta:1,at:0}],probabilities:[],balance:1,tickets:1,streak:1,serverTime:1,nextTicketAt:0,pity:8,misses:0};
  const doc={currentScript:{src:'http://127.0.0.1/club/app.js'},head,body,createElement:t=>new Node(t),activeElement:null};let resolveFetch;const fetched=new Promise(r=>resolveFetch=r);const window={render(){}};
  const context={document:doc,window,URL,Date,crypto,AbortSignal,sessionStorage:{getItem(){return null},removeItem(){},setItem(){}},fetch:async()=>({ok:true,json:async()=>{resolveFetch();return s;}}),matchMedia:()=>({matches:true}),setTimeout,view:null};
  vm.runInNewContext(source,context);window.GameClub.mount(root);return fetched.then(()=>new Promise(r=>setImmediate(r))).then(()=>{assert.ok(root.textContent.includes(hostile));const all=n=>[n,...n.children.flatMap(all)];assert.equal(all(root).filter(n=>n.tag==='img').length,0);assert.ok(!all(root).some(n=>n.href?.startsWith('javascript:')));});
});
test('classic changes only one menu entry; shared assets exclude backend and compact design is preserved',()=>{
  const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),baseline=file=>execFileSync('git',['show','origin/main:'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  for(const file of ['dialogs.js','cloud-server.js','config.js','package.json'])assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),baseline(file),file);
  for(const file of ['app.js','v2/app.js'])assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(file==='app.js'?'href="club/?from=old"':'href="../club/?from=new"'),file);
  const files=require('../site-files.json');for(const file of ['club/index.html','club/app.js','club/games.js','club/styles.css','club/fairness.js'])assert.ok(files.includes(file));assert.ok(!files.some(f=>/mock|tests|local-private|\.env|\.cjs/.test(f)));
});
