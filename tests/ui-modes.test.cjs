const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('mode preference redirects inside the repository subpath and tolerates unavailable storage',()=>{
  for(const current of ['old','new'])for(const saved of [null,'old','new','invalid'])for(const blocked of [false,true]){
    const redirects=[],writes=[];let click;
    const c={URL,Object,document:{currentScript:{src:'https://example.test/for-starosta/ui-mode.js'},addEventListener:(type,fn)=>click=fn},
      location:{pathname:'/for-starosta/'+(current==='new'?'v2/':''),replace:url=>redirects.push(url)},
      localStorage:{getItem(){if(blocked)throw Error('blocked');return saved;},setItem:(...args)=>{if(blocked)throw Error('blocked');writes.push(args);}}};
    vm.runInNewContext(read('ui-mode.js'),c);
    assert.deepEqual(redirects,!blocked&&['old','new'].includes(saved)&&saved!==current?['https://example.test/for-starosta/'+(saved==='new'?'v2/':'')]:[]);
    click({target:{closest:()=>({dataset:{uiMode:current==='old'?'new':'old'}})}});
    assert.deepEqual(writes,blocked?[]:[['starosta-ui-mode',current==='old'?'new':'old']]);
  }
});

function worker(file){
  const handlers={},deleted=[],added=[],matches=[];
  const own=file.startsWith('v2/')?'new':'old';
  const origin='https://example.test/for-starosta/';
  const cache={addAll:async urls=>added.push(...urls),put:async()=>{},match:async request=>{
    const url=typeof request==='string'?request:request.url;matches.push(url);
    return added.includes(url)?new Response(url):undefined;
  }};
  vm.runInNewContext(read(file),{URL,Response,fetch:async()=>{throw Error('offline');},
    self:{location:{href:origin+file},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches:{open:async name=>{assert.equal(name,'starosta-'+own+'-v1');return cache;},keys:async()=>['starosta-old-v0','starosta-old-v1','starosta-new-v0','starosta-new-v1','starosta-v28','unrelated'],delete:async name=>deleted.push(name)}});
  const dispatch=async(name,extra={})=>{let result;handlers[name]({...extra,waitUntil:p=>result=p,respondWith:p=>result=p});return result;};
  return {dispatch,deleted,added,matches,origin};
}

test('workers only remove their own old caches (root also removes exact legacy names)',async()=>{
  for(const file of ['sw.js','v2/sw.js']){
    const w=worker(file);await w.dispatch('activate');
    assert.deepEqual(w.deleted,file==='sw.js'?['starosta-old-v0','starosta-v28']:['starosta-new-v0']);
  }
});

test('root precaches both complete interfaces; offline navigation never crosses modes',async()=>{
  for(const file of ['sw.js','v2/sw.js']){
    const w=worker(file);await w.dispatch('install');
    for(const dir of file==='sw.js'?['','v2/']:['v2/']){
      const html=read(dir+'index.html');
      for(const [,asset]of html.matchAll(/(?:src|href)="([^"]+)"/g)){
        if(!/^(https?:|#)/.test(asset))assert.ok(w.added.includes(new URL(asset,w.origin+dir).href),asset);
      }
      const response=await w.dispatch('fetch',{request:{url:w.origin+dir+'?offline-test=1',method:'GET',mode:'navigate'}});
      assert.equal(await response.text(),w.origin+dir+'index.html');
    }
    assert.equal(await w.dispatch('fetch',{request:{url:w.origin+'api/state',method:'GET'}}),undefined);
    assert.equal(await w.dispatch('fetch',{request:{url:'https://api.example.test/private',method:'GET'}}),undefined);
    assert.equal(await w.dispatch('fetch',{request:{url:w.origin+'api/state',method:'POST'}}),undefined);
  }
});

test('switch is outside editor-only markup; v2 shares resources and journal format',()=>{
  for(const dir of ['','v2/']){
    const app=read(dir+'app.js'),more=app.slice(app.indexOf('function viewMore(){'),app.indexOf('function pairFromTime('));
    assert.ok(more.indexOf('data-ui-mode=')>more.indexOf("`:''}"));
    assert.ok(!more.match(/data-act="[^"]*"[^>]*data-ui-mode/));
    assert.ok(read(dir+'index.html').indexOf('ui-mode.js')<read(dir+'index.html').indexOf('</head>'));
  }
  const manifest=JSON.parse(read('v2/manifest.webmanifest'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  assert.ok(manifest.icons.every(i=>i.src.startsWith('../icon-')));
  const old=read('app.js'),newer=read('v2/app.js');
  assert.equal(old.match(/const KEY\s*=\s*[^;]+;/)[0],newer.match(/const KEY\s*=\s*[^;]+;/)[0]);
});
