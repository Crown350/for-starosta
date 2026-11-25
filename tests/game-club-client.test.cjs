'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../club/app.js'),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function harness({reduced=false,response}={}){
  let document;
  class Node{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;this.attrs={};}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}get textContent(){return this.text??this.children.map(n=>n.textContent).join(' ');}set textContent(t){this.text=String(t);}querySelectorAll(){return all(this).filter(n=>n.dataset.clubFocus);}focus(){document.activeElement=this;}}
  const all=n=>[n,...n.children.flatMap(all)],root=new Node('main'),body=new Node('body');body.dataset.screen='gameclub';
  document={body,head:new Node('head'),currentScript:{src:'http://127.0.0.1/club/app.js'},activeElement:null,createElement:tag=>new Node(tag)};
  const storage=new Map(),calls=[],timers=[];
  const state={account:'demo',mock:true,balance:0,tickets:1,streak:1,misses:0,pity:8,serverTime:1,nextTicketAt:86400000,owned:[],equipped:{},history:[],catalogue:[],events:[],probabilities:[{label:'Свет',sparks:50,probability:1}]};
  const window={render(){}};
  const context={window,document,URL,Date,crypto,AbortSignal,view:'gameclub',matchMedia:()=>({matches:reduced}),setTimeout:(fn,ms)=>{timers.push({fn,ms});},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/state'))return {ok:true,json:async()=>state};return response?response(url,options,state):{ok:true,json:async()=>({state:{...state,balance:50,tickets:0,history:[{type:'spin',reason:'Свет',delta:50,at:1,reward:{label:'Свет',sparks:50}}]},receipt:{reason:'Свет',delta:50},replayed:false})};}};
  vm.runInNewContext(source,context);
  return {root,all:()=>all(root),find:text=>all(root).find(n=>n.tag==='button'&&n.textContent===text),window,storage,calls,timers};
}
test('system reduced motion shows actual reward immediately without animation or skip',async()=>{
  const h=harness({reduced:true});h.window.GameClub.mount(h.root);await flush();await h.find('Открыть награду').onclick();assert.ok(h.root.textContent.includes('+50 Искр'));assert.ok(!h.all().some(n=>n.className?.includes('club-spinning')));assert.equal(h.find('Пропустить анимацию'),undefined);assert.ok(h.all().find(n=>n.tag==='input'&&n.type==='checkbox').disabled);
});
test('animation can be skipped with the same already committed result',async()=>{
  const h=harness();h.window.GameClub.mount(h.root);await flush();await h.find('Открыть награду').onclick();assert.ok(h.all().some(n=>n.className?.includes('club-spinning')));h.find('Пропустить анимацию').onclick();assert.ok(!h.all().some(n=>n.className?.includes('club-spinning')));assert.ok(h.root.textContent.includes('+50 Искр'));assert.equal(h.calls.filter(c=>c.url.endsWith('/command')).length,1);
});
test('network recovery retries exact body and key; storage contains no authoritative balance',async()=>{
  let attempts=0;const h=harness({response:async(url,options,state)=>{if(attempts++===0)throw Error('connection lost');return {ok:true,json:async()=>({state:{...state,balance:50,tickets:0},receipt:{reason:'Свет',delta:50},replayed:true})};}});
  h.window.GameClub.mount(h.root);await flush();await h.find('Открыть награду').onclick();const saved=JSON.parse([...h.storage.values()][0]);assert.deepEqual(Object.keys(saved).sort(),['account','body','key']);assert.equal(saved.body.type,'spin');assert.ok(!('balance'in saved));await h.find('Повторить запрос').onclick();const calls=h.calls.filter(c=>c.url.endsWith('/command'));assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);assert.equal(h.storage.size,0);assert.ok(h.root.textContent.includes('50'));
});
test('authentication loss retains pending key for re-login',async()=>{
  const h=harness({response:async()=>({ok:false,status:401,json:async()=>({error:'SESSION_CHANGED'})})});h.window.GameClub.mount(h.root);await flush();await h.find('Открыть награду').onclick();assert.equal(h.storage.size,1);assert.ok(h.root.textContent.includes('Войди снова по ключу доступа'));assert.ok(h.root.textContent.includes('Вход по ключу доступа'));
});
