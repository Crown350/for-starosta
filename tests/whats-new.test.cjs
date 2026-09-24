const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../whats-new.js'),'utf8');
const key='starosta-whats-new-seen',version='ui-modes-1';
function setup(data=new Map(),options={}){
  const events={},elements=[];
  const document={activeElement:{isConnected:true,focus(){this.restored=true;}},
    addEventListener:(type,fn)=>events[type]=fn,
    querySelector:()=>options.busy?{}:elements.find(e=>e.open),
    createElement(tag){const e={tag,children:[],events:{},open:false,isConnected:true,
      append(...items){this.children.push(...items);},setAttribute(k,v){this[k]=v;},
      addEventListener(k,fn){this.events[k]=fn;},focus(){document.activeElement=this;},
      showModal(){if(options.failShow)throw Error('unavailable');this.open=true;},
      close(){this.open=false;this.events.close?.();events.close?.();}};
      Object.defineProperty(e,'innerHTML',{set(){throw Error('Unsafe HTML sink');}});
      elements.push(e);return e;},head:{append(){}},body:{append(){}}};
  const previous=document.activeElement,window={};
  vm.runInNewContext(options.source||source,{document,window,localStorage:{
    getItem(k){if(options.readError)throw Error('denied');return data.get(k);},
    setItem(k,v){if(options.writeError)throw Error('denied');data.set(k,v);}}});
  const modal=elements.find(e=>e.tag==='dialog'),button=elements.find(e=>e.tag==='button');
  return {window,modal,button,elements,previous,document,ready:()=>window.whatsNewReady(),manual:()=>events.click({target:{closest:()=>({})}}),unblock(){options.busy=false;events.close();}};
}
test('first successful interface load shows dialog and records version only after showing',()=>{
  const data=new Map(),s=setup(data);assert.equal(s.modal.open,false);assert.equal(data.has(key),false);
  s.ready();assert.equal(s.modal.open,true);assert.equal(data.get(key),version);assert.equal(s.document.activeElement,s.button);
  s.button.events.click();assert.equal(s.modal.open,false);assert.equal(s.previous.restored,true);
});
test('reload and other interface share seen version; deleting key permits display',()=>{
  const data=new Map();setup(data).ready();for(let i=0;i<2;i++){const s=setup(data);s.ready();assert.equal(s.modal.open,false);}
  data.delete(key);const s=setup(data);s.ready();assert.equal(s.modal.open,true);
});
test('older version opens updated changelog',()=>{const s=setup(new Map([[key,'old']]));s.ready();assert.equal(s.modal.open,true);});
test('manual More action opens even when already seen',()=>{const s=setup(new Map([[key,version]]));s.ready();s.manual();assert.equal(s.modal.open,true);});
test('storage read/write exceptions never break startup or repeat within one page',()=>{
  for(const options of [{readError:true},{writeError:true},{readError:true,writeError:true}]){
    const s=setup(new Map(),options);assert.doesNotThrow(s.ready);assert.equal(s.modal.open,true);
    s.modal.close();s.ready();assert.equal(s.modal.open,false);
  }
});
test('another dialog delays automatic display and storage write',()=>{
  const data=new Map(),s=setup(data,{busy:true});s.ready();assert.equal(s.modal.open,false);assert.equal(data.has(key),false);
  s.unblock();assert.equal(s.modal.open,true);assert.equal(data.get(key),version);
});
test('failed show does not consume announcement',()=>{const data=new Map(),s=setup(data,{failShow:true});s.ready();assert.equal(data.has(key),false);});
test('changelog content is text, including HTML payloads',()=>{
  const payload='<img src=x onerror=alert(1)>',s=setup(new Map(),{source:source.replace('Добавлен новый интерфейс приложения.',payload)});
  s.ready();assert.ok(s.elements.some(e=>e.tag==='li'&&e.textContent===payload));assert.ok(!s.elements.some(e=>e.tag==='img'));
});
test('both modes expose manual action, load shared module before startup and announce after rendering',()=>{
  for(const dir of ['','v2/']){
    const app=fs.readFileSync(require.resolve('../'+dir+'app.js'),'utf8');
    const more=app.slice(app.indexOf('function viewMore(){'),app.indexOf('function pairFromTime('));
    assert.ok(more.includes('data-whats-new>Что нового</button>'));
    const start=app.slice(app.indexOf('async function startApp(){'));assert.ok(start.indexOf('render();')<start.indexOf('window.whatsNewReady?.();'));
    const html=fs.readFileSync(require.resolve('../'+dir+'index.html'),'utf8');assert.ok(html.indexOf('whats-new.js')<html.indexOf('<script src="cloud.js'));
  }
});
