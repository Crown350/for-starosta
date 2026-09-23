const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');const path=require('node:path');
const root=path.join(__dirname,'../v2');
const TEST_GROUP='ТЕСТ-ГРУППА';
const source=fs.readFileSync(require.resolve('../v2/app.js'),'utf8');
const navFn=source.slice(source.indexOf('const NAV_TABS={'),source.indexOf("let navSig='';"));
const pairsFn=source.slice(source.indexOf('function viewPairs(){'),source.indexOf('function viewAtt(){'));
const S={group:TEST_GROUP,students:[{id:'s1',fio:'Иванов Иван'},{id:'s2',fio:'Петров Пётр'},{id:'s3',fio:'Сидоров Сидор'}],subjects:[{id:'p1',name:'Базы данных'}],teachers:[],lessons:[{id:'l1',date:'2026-09-15',pair:1,subjectId:'p1',kind:'лаба',room:'А215',time:'09:00'},{id:'l2',date:'2026-09-15',pair:2,subjectId:'p1',kind:'лекция',room:'311-4',time:'10:40'}],att:{l1:{s2:'n'}},tpl:[],schedule:{week:'odd',group:TEST_GROUP},limit:3};
function pairs(editable){
 const c=vm.createContext({S,curDate:'2026-09-15',scheduleLoading:false,esc:String,plural:(n,a)=>n+' '+a,
  DOW:['вс','пн','вт','ср','чт','пт','сб'],dowOf:()=>2,fmtDate:x=>x,todayISO:()=>'2026-09-15',
  lessonsOn:d=>S.lessons.filter(l=>l.date===d).sort((a,b)=>a.pair-b.pair),ensureBGTULessonsForDate:()=>0,
  head:()=>'',bgtuWeekLabel:w=>w,bgtuCurrentWeekForDate:()=>'odd',
  pairFromTime:t=>{const m=String(t).match(/^(\d{1,2}):/);return m?(+m[1])*60:0;},
  subjName:()=>'Базы данных',lessonLocation:()=>'',formatTeacherName:x=>x,teachName:()=>'',icon:()=>'',
  window:{cloudCanEdit:()=>editable}});
 vm.runInContext(pairsFn,c);return c.viewPairs();
}
test('navigation is declarative and role-aware',()=>{
 const c=vm.createContext({NAV_SVGS:{pairs:'i',schedule:'i',semester:'i',works:'i',money:'i',group:'i',more:'i'}});
 vm.runInContext(navFn+';globalThis.NAV_TABS=NAV_TABS;',c);
 assert.deepEqual([...c.NAV_TABS.reader.map(t=>t.id)],['pairs','schedule','semester','more']);
 assert.deepEqual([...c.NAV_TABS.editor.map(t=>t.id)],['pairs','works','money','group','more']);
 assert.equal(c.NAV_TABS.editor.some(t=>t.id==='schedule'),false);
});
test('public Today hides journal data and offers editor login',()=>{
 const html=pairs(false);
 for(const text of ['cloudlogin','grouplist','hero','пара','неделя'])assert.ok(html.includes(text),text);
 for(const text of ['openatt','editlesson','dellesson','addlesson','fromtpl','daysum','chip bad','chip warn'])assert.ok(!html.includes(text),text);
});
test('editor Today exposes attendance actions and marks summary',()=>{
 const html=pairs(true);
 for(const act of ['openatt','editlesson','dellesson','addlesson','fromtpl','daysum'])assert.ok(html.includes('data-act="'+act+'"'),act);
 assert.ok(html.includes('chip bad'),('отметка Н видна'));
 assert.ok(!html.includes('cloudlogin'),'вход старосты скрыт в редакторе');
});
test('shell ships an empty nav container for dynamic role-aware tabs',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('<nav id="nav" aria-label="Основные разделы"></nav>'));
 assert.ok(!/data-tab="works"/.test(html),'статические вкладки удалены из HTML');
});
const bgtuFn=source.slice(source.indexOf('function viewBGTU(){'),source.indexOf('function viewDir(){'));
function bgtu(editable){
 const c=vm.createContext({ctx:{},S:{group:TEST_GROUP,schedule:{group:TEST_GROUP,week:'odd',fetchedAt:'2026-09-15T08:00:00Z'}},
  head:()=>'',esc:String,bgtuTpls:w=>[{dow:2,pair:1,time:'08:00 - 09:35',subjectId:'p1',teacherId:'t1',room:'231'}],
  DOW:['вс','пн','вт','ср','чт','пт','сб'],subjName:()=>'Алгебра',formatTeacherName:x=>x,teachName:()=>'',
  todayISO:()=>'2026-09-15',bgtuCurrentWeekForDate:()=>'odd',bgtuWeekLabel:w=>w,Date});
 c.window={cloudCanEdit:()=>editable};vm.runInContext(bgtuFn,c);return c.viewBGTU();
}
test('public BGTU schedule keeps preview only, controls live with editor',()=>{
 const html=bgtu(false);
 assert.ok(html.includes('Обновлено:'),'дата доступна гостю');
 assert.ok(html.includes('Снимок старше 6 часов'),'устаревание видно гостю');
 for(const text of ['превью','grouplist','openbgtu',TEST_GROUP,'неделя'])assert.ok(html.includes(text),text);
 for(const text of ['syncbgtu','setweek','Обновить','Параметры зафиксированы'])assert.ok(!html.includes(text),text);
});
test('editor BGTU schedule exposes week toggle, sync and status',()=>{
 const html=bgtu(true);
 for(const act of ['syncbgtu','setweek'])assert.ok(html.includes('data-act="'+act+'"'),act);
 for(const text of ['Обновлено:','Параметры зафиксированы'])assert.ok(html.includes(text),text);
});
