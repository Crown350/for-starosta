const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../v2/app.js'),'utf8');
const cloud=fs.readFileSync(require.resolve('../v2/cloud.js'),'utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to));
const lesson=(extra={})=>({week:'odd',dow:1,pair:1,time:'08:00 - 09:35',subject:'Предмет 1',teacher:'Преподаватель 1',room:'101',kind:'Лекции',...extra});
const snapshot=(lessons=[lesson()])=>({ok:true,group:'ТЕСТ',currentWeek:'odd',fetchedAt:'2026-09-20T10:00:00Z',lessons});
function setup(){
  let id=0,date='2026-09-14',renders=0,saves=0;
  const c=vm.createContext({window:{},Date,AbortController,setTimeout,clearTimeout,console,
    NAMES:[],SUBJ:[],uid:p=>p+(++id),ctx:{},scheduleLoading:false,curDate:date,APP_V:11,
    todayISO:()=>date,dowOf:d=>new Date(d+'T12:00:00Z').getUTCDay(),
    head:()=>'',save:()=>saves++,render:()=>renders++,toast(){},formatTeacherName:x=>x,
    fetch:async()=>({ok:true,json:async()=>snapshot()})});
  vm.runInContext(slice('function fresh(){','let S =')+slice('function esc(','function todayISO(')
    +slice('function subjName(','function norm(')+slice('function pairFromTime(','function viewDir(){')
    +slice('function viewMore(){','function pairFromTime('),c);
  c.S=c.fresh();c.window.cloudCanEdit=()=>true;c.window.cloudHasSession=()=>true;
  return {c,setDate:d=>date=d,get renders(){return renders},get saves(){return saves}};
}
test('all distinct lessons and subgroups survive import, daily expansion and table rendering',()=>{
  const {c}=setup();const first=lesson();
  c.applyBGTUSchedule(snapshot([first,{...first},lesson({subject:'Предмет 2',teacher:'Преподаватель 2',room:'102'}),lesson({subgroup:'2'})]));
  assert.equal(c.S.tpl.length,3);assert.equal(c.S.lessons.length,3);
  const html=c.bgtuWeekTable('odd');
  for(const text of ['Предмет 1','Предмет 2','Преподаватель 1','Преподаватель 2','101','102','Подгруппа'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/<details class="bw-lesson"/g)||[]).length,3);
});
test('complete per-lesson time/name/type/teacher/room stays accessible in native details',()=>{
  const {c}=setup();const full='Очень длинное название предмета с дополнительными сведениями и подгруппой';
  c.applyBGTUSchedule(snapshot([lesson({subject:full}),lesson({dow:2,time:'10:00 - 11:35'})]));
  const html=c.bgtuWeekTable('odd');assert.ok(html.includes(full));assert.ok(html.includes('10:00 - 11:35'));assert.ok(html.includes('08:00 - 09:35'));
  assert.match(html,/разное<br>время/);assert.match(html,/<summary>/);assert.match(html,/tabindex="0" role="region"/);
});
test('More and table use the same week across Sunday/Monday, including previous weeks',()=>{
  const {c,setDate}=setup();c.applyBGTUSchedule(snapshot());
  for(const [date,week,label] of [['2026-09-20','odd','нечётная'],['2026-09-21','even','чётная'],['2026-09-28','odd','нечётная']]){
    setDate(date);assert.equal(c.bgtuCurrentWeekForDate(date),week);
    assert.ok(c.viewMore().includes(' · '+label+' неделя'));
    assert.ok(c.viewBGTU().includes('сейчас '+label));
  }
});
test('malformed or incomplete snapshots never remove the saved schedule',()=>{
  const {c}=setup();c.applyBGTUSchedule(snapshot());const before=JSON.stringify(c.S);
  for(const bad of [[],[null],[lesson(),{}],[lesson({dow:9})],[lesson({pair:Infinity})],[lesson({time:'99:99'})],[lesson({subject:''})]]){
    assert.throws(()=>c.applyBGTUSchedule(snapshot(bad)));assert.equal(JSON.stringify(c.S),before);
  }
  assert.throws(()=>c.applyBGTUSchedule({...snapshot(),period:{}}));assert.equal(JSON.stringify(c.S),before);
});
test('new table output escapes all external strings, including errors and metadata',()=>{
  const {c}=setup();const payload='\"><img src=x onerror=alert(1)><svg onload=alert(1)>';
  c.applyBGTUSchedule(snapshot([lesson({subject:payload,teacher:payload,room:payload,kind:payload,subgroup:payload})]));
  Object.assign(c.S.schedule,{semester:payload,lastError:payload,fetchedAt:payload});c.ctx.bgtuMessage=payload;
  c.S.tpl[0].time=payload;
  const html=c.viewBGTU();assert.doesNotMatch(html,/<(?:img|svg)\b/);assert.ok(html.includes('&lt;img'));
  for(const tag of html.match(/<[^>]*>/g)||[])assert.doesNotMatch(tag.replace(/"[^"]*"|'[^']*'/g,''),/\s(on\w+|autofocus)\s*=/i);
});
test('public cache remaps IDs and never carries private rows or records between sessions',()=>{
  const {c}=setup();c.applyBGTUSchedule(snapshot());
  c.S.students=[{id:'private',fio:'PRIVATE'}];c.S.tpl.push({source:'manual',subjectId:'private'});
  const next=c.fresh();next.group='ТЕСТ';next.subjects=[{id:c.S.tpl[0].subjectId,name:'PRIVATE SUBJECT'}];
  c.window.restorePublicBGTU(next);
  assert.equal(next.tpl.length,1);assert.equal(next.students.length,0);
  assert.equal(next.subjects.find(s=>s.id===next.tpl[0].subjectId).name,'Предмет 1');
  assert.equal(next.teachers.find(t=>t.id===next.tpl[0].teacherId).fio,'Преподаватель 1');
  assert.equal(next.schedule.weekAnchor,'2026-09-20');
  const foreign=c.fresh();foreign.group='OTHER';c.window.restorePublicBGTU(foreign);assert.equal(foreign.tpl.length,0);
  c.usePublicSchedule=false;vm.runInContext(cloud.slice(cloud.indexOf('  function keepBgtu('),cloud.indexOf('  async function pull()')),c);
  assert.equal(c.keepBgtu(c.fresh()).tpl.length,0);
});
test('restoring the public template preserves incoming manual records and never duplicates BGTU rows',()=>{
  const {c}=setup();c.applyBGTUSchedule(snapshot([lesson(),lesson({dow:2,pair:2})]));
  const next=c.fresh();next.group='ТЕСТ';
  const manual={id:'manual-template',source:'manual',subjectId:'own',dow:3,pair:1};
  const marked={id:'marked-lesson',source:'bgtu',date:'2026-09-21'};
  const past={id:'past-lesson',source:'bgtu',date:'2026-09-13'};
  const manualLesson={id:'manual-lesson',source:'manual',date:'2026-09-21'};
  next.tpl=[manual];next.students=[{id:'own-student',fio:'Incoming student'}];
  next.lessons=[marked,past,manualLesson];next.att[marked.id]={'own-student':'n'};
  c.usePublicSchedule=true;vm.runInContext(cloud.slice(cloud.indexOf('  function keepBgtu('),cloud.indexOf('  async function pull()')),c);
  for(let attempt=0;attempt<2;attempt++){
    assert.equal(c.keepBgtu(next),next);
    assert.equal(next.tpl.filter(t=>t.source==='bgtu').length,2);
    assert.equal(next.tpl.length,3);assert.equal(next.tpl[0],manual);
    assert.deepEqual(Array.from(next.lessons),[marked,past,manualLesson]);
    assert.equal(next.att[marked.id]['own-student'],'n');
    assert.equal(next.students[0].fio,'Incoming student');
    assert.equal(next.subjects.length,1);assert.equal(next.teachers.length,1);
  }
});

test('old in-flight snapshots cannot replace a new session or clear its loading state',async()=>{
  const {c}=setup();let resolve;c.fetch=()=>new Promise(r=>resolve=r);
  const pending=c.loadScheduleSnapshot();c.S=c.fresh();const current=c.S;c.scheduleLoading=true;
  resolve({ok:true,json:async()=>snapshot()});await pending;
  assert.equal(c.S,current);assert.equal(c.S.tpl.length,0);assert.equal(c.scheduleLoading,true);
});
test('invalid Edge snapshot falls back; refresh failure keeps saved rows and reports an escaped error',async()=>{
  const {c}=setup();c.window.STAROSTA_SUPABASE_URL='test';c.window.starostaSupabaseFetch=async()=>({ok:true,json:async()=>snapshot([{}])});
  await c.loadScheduleSnapshot();assert.equal(c.S.tpl.length,1);
  const before=JSON.stringify(c.S.tpl);c.window.STAROSTA_YANDEX_FUNCTION_URL='https://example.test/schedule';
  c.fetch=async()=>({ok:true,json:async()=>snapshot(Array(10).fill({}))});await c.refreshBGTU();
  assert.equal(JSON.stringify(c.S.tpl),before);assert.equal(c.ctx.bgtuFailed,true);assert.equal(c.ctx.bgtuBusy,false);
});
test('real committed public snapshot remains accepted',()=>{const {c}=setup();assert.doesNotThrow(()=>c.applyBGTUSchedule(JSON.parse(fs.readFileSync(require.resolve('../schedule.json'),'utf8'))));assert.ok(c.S.tpl.length>=10);});

function cloudSetup(){
  const {c}=setup();c.applyBGTUSchedule(snapshot());
  const elements={},events={},requests=[];let tick;let revision=1;
  const element=()=>({value:'',hidden:false,checked:false,dataset:{},classList:{toggle(){},remove(){},add(){}},
    append(){},insertBefore(){},setAttribute(){},removeAttribute(){},focus(){},close(){this.open=false;}});
  c.document={body:element(),activeElement:null,hidden:false,createElement:element,
    getElementById:id=>elements[id]??=element(),querySelector:()=>element(),querySelectorAll:()=>[],
    addEventListener:(type,fn,capture)=>{if(capture)events[type]=fn;}};
  c.window.addEventListener=()=>{};c.startApp=async()=>{};
  c.MutationObserver=class{observe(){}};c.JournalLocalCopy=class{async init(){return false}async logout(){}async save(){}};
  c.store={};c.KEY='test';c.setInterval=fn=>tick=fn;c.AbortSignal=AbortSignal;c.askConfirm=async()=>true;
  c.fetch=async(url,options)=>{
    requests.push({url,method:options?.method||'GET'});
    if(url==='../schedule.json')return {ok:true,json:async()=>snapshot()};
    const key=options.headers.Authorization;
    return {ok:true,json:async()=>url==='/api/session'?{usePublicSchedule:true}:{revision,data:{group:'ТЕСТ',students:[{id:key,fio:key}],subjects:[{id:'p1',name:'Private'}]}}};
  };
  vm.runInContext(cloud,c);
  return {c,events,requests,elements,login:async key=>{c.document.getElementById('cloud-key').value=key;await elements['cloud-login'].onsubmit({preventDefault(){}});},refresh:()=>{revision++;return tick();}};
}
test('login, cloud reload, background refresh, logout and relogin retain public schedule without private carryover',async()=>{
  const t=cloudSetup();await t.login('session-one');assert.equal(t.c.window.cloudCanEdit(),true);assert.equal(t.c.S.tpl.length,1);
  await t.elements['cloud-pull'].onclick();await t.refresh();assert.equal(t.c.S.tpl.length,1);
  assert.equal(t.c.S.subjects.find(p=>p.id===t.c.S.tpl[0].subjectId).name,'Предмет 1');
  await t.elements['cloud-logout'].onclick();assert.equal(t.c.window.cloudHasSession(),false);assert.equal(t.c.S.students.length,0);assert.equal(t.c.S.tpl.length,1);
  await t.login('session-two');assert.equal(t.c.S.students.length,1);assert.match(t.c.S.students[0].id,/session-two/);assert.doesNotMatch(JSON.stringify(t.c.S),/session-one/);
  assert.equal(t.c.S.tpl.length,1);
});
test('guest refresh stays read-only and action gate still blocks journal edits',async()=>{
  const t=cloudSetup();assert.equal(t.c.window.cloudCanEdit(),false);t.c.window.cloudSave();assert.equal(t.requests.length,0);
  for(const [action,blocked] of [['syncbgtu',false],['addlesson',true],['restore',true]]){
    let stopped=false;t.events.click({target:{closest:()=>({dataset:{act:action}})},preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,blocked);
  }
  t.c.window.STAROSTA_YANDEX_FUNCTION_URL='https://example.test/public';t.c.fetch=async(url,options)=>{
    assert.equal(options.headers.Authorization,undefined);return {ok:true,json:async()=>snapshot(Array(10).fill(lesson()))};};
  await t.c.refreshBGTU();assert.equal(t.c.ctx.bgtuFailed,false);assert.equal(t.c.window.cloudCanEdit(),false);
});
