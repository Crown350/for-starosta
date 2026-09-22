const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const cloud=fs.readFileSync(require.resolve('../cloud.js'),'utf8');
test('login dialog waits for journal read and keeps read errors visible',async()=>{
  const source=cloud.slice(cloud.indexOf("  document.getElementById('cloud-login').onsubmit="),cloud.indexOf("  document.getElementById('cloud-pull').onclick="));
  for(const failed of [false,true]){
    let resolve,reject;const loaded=new Promise((a,b)=>{resolve=a;reject=b;});
    const els={'cloud-login':{},'cloud-key':{value:'test',focus(){}},'cloud-error':{hidden:true}};
    const dlg={open:true,setAttribute(){},removeAttribute(){},close(){this.open=false;}};
    const c=vm.createContext({document:{getElementById:id=>els[id]},dlg,sessionEpoch:0,token:'',ready:false,status(){},permissions(){},api:async()=>({}),pull:()=>loaded});
    vm.runInContext(source,c);const pending=els['cloud-login'].onsubmit({preventDefault(){}});
    await Promise.resolve();await Promise.resolve();assert.equal(dlg.open,true,'dialog remains open while reading');
    if(failed)reject(Error('Нет соединения'));else resolve();await pending;
    assert.equal(dlg.open,failed);
    if(failed){assert.equal(els['cloud-error'].hidden,false);assert.equal(els['cloud-error'].textContent,'Нет соединения');}
  }
});
test('final render clears the schedule spinner on success and failure',async()=>{
  const source=app.slice(app.indexOf('async function loadScheduleSnapshot(){'),app.indexOf('async function refreshBGTU(){'));
  for(const failed of [false,true]){
    const rendered=[];
    const c=vm.createContext({window:{},S:{schedule:{}},scheduleLoading:false,AbortController,setTimeout,clearTimeout,
      fetch:async()=>{if(failed)throw Error('offline');return {ok:true,json:async()=>({ok:true,lessons:[{}],fetchedAt:'2026-09-15T12:00:00Z'})};},
      render:()=>rendered.push(c.scheduleLoading),save(){},applyBGTUSchedule(){}});
    vm.runInContext(source,c);await c.loadScheduleSnapshot();
    assert.equal(c.scheduleLoading,false);assert.equal(rendered.at(-1),false);
  }
});
test('editing preserves imported and unfamiliar lesson kinds',async()=>{
  const kinds=app.match(/^const KINDS = .*;$/m)[0];
  const edit=app.slice(app.indexOf("    case 'editlesson':"),app.indexOf("    case 'dellesson':"));
  for(const kind of ['Лекции','Практические занятия','Лабораторные работы','Электронные лекции','Консультация']){
    const lesson={id:'l1',subjectId:'p1',pair:1,kind,date:'2026-09-15',room:''};
    const c=vm.createContext({btn:{dataset:{id:'l1'}},S:{lessons:[lesson],subjects:[{id:'p1',name:'Тестовый предмет'}],teachers:[]},curDate:lesson.date,formatTeacherName:x=>x,save(){},askForm:async form=>{
      const field=form.fields.find(f=>f.name==='kind');assert.ok(field.options.some(o=>o.value===kind),kind);
      return Object.fromEntries(form.fields.map(f=>[f.name,f.value??'']));
    }});
    vm.runInContext(kinds+"\nasync function run(){switch('editlesson'){"+edit+'}}',c);await c.run();assert.equal(lesson.kind,kind);
  }
});
