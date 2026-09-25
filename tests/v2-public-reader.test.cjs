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
   dowOf:()=>2,
   todayISO:()=>'2026-09-15',bgtuCurrentWeekForDate:()=>'odd',bgtuWeekLabel:w=>w,bgtuWeekGenitive:w=>w,Date});
  c.window={cloudCanEdit:()=>editable};vm.runInContext(bgtuFn,c);return c.viewBGTU();
}
test('public BGTU schedule shows both weeks in one table without editor controls',()=>{
  const html=bgtu(false);
  assert.ok(html.includes('Обновлено:'),'дата доступна гостю');
  assert.ok(html.includes('Снимок старше 6 часов'),'устаревание видно гостю');
  for(const text of ['<table class="bw"','Обе недели','нечётная неделя','чётная неделя','openbgtu',TEST_GROUP,'неделя'])assert.ok(html.includes(text),text);
  for(const text of ['syncbgtu','setweek','Обновить','Параметры зафиксированы'])assert.ok(!html.includes(text),text);
});
test('editor BGTU schedule exposes refresh and keeps the week table',()=>{
  const html=bgtu(true);
  assert.ok(html.includes('data-act="syncbgtu"'),'refresh is available to the editor');
  for(const text of ['Обновлено:','Параметры зафиксированы','<table class="bw"'])assert.ok(html.includes(text),text);
});

/* Настоящий код таблицы БГТУ целиком: нормализация данных, строки, окна. */
const weekFn=source.slice(source.indexOf('function bgtuWeekLabel(w){'),source.indexOf('function viewDir(){'));
const T=(week,dow,pair,extra={})=>({source:'bgtu',week,dow,pair,time:'08:00 - 09:35',subjectId:'p1',room:'231',...extra});
function sched(tpl){
  const c=vm.createContext({ctx:{},S:{group:TEST_GROUP,tpl,schedule:{group:TEST_GROUP,week:'even',
      currentWeek:'even',weekAnchor:'2026-09-14',fetchedAt:'2026-09-15T08:00:00Z'}},
    head:()=>'',esc:String,subjName:id=>'Предмет '+id,formatTeacherName:x=>x,teachName:id=>'Иванов И. И.',
    dowOf:()=>3,todayISO:()=>'2026-09-15',Date,Math,Set});
  c.window={cloudCanEdit:()=>false};c.view='bgtu';
  vm.runInContext(weekFn,c);
  return c.viewBGTU();
}
test('BGTU table collapses a run of pair numbers and shows a single one as-is',()=>{
  const html=sched([T('odd',1,1),T('odd',1,2),T('odd',1,3),T('odd',1,4),T('odd',1,8),T('odd',1,9)]);
  assert.ok(html.includes('>5–7</th>'),'пропуск 5-6-7 схлопнут в диапазон');
  assert.ok(!html.includes('5–7–'),'диапазон не сломан');
  const one=sched([T('odd',1,1),T('odd',1,2),T('odd',1,4)]);
  assert.ok(one.includes('>3</th>'),'одиночный пропущенный номер без диапазона');
  assert.ok(!one.includes('3–3'),'диапазон из одного номера не показывается');
});
test('BGTU table closes leading, inner and trailing gaps',()=>{
  const html=sched([T('odd',1,3),T('odd',2,4),T('odd',1,9)]);
  assert.ok(html.includes('>1–2</th>'),'пропуск в начале');
  assert.ok(html.includes('>5–8</th>'),'пропуск в конце');
  assert.ok(html.includes('<b>9</b>'),'последняя пара на месте');
  const both=sched([T('even',4,1),T('odd',4,3)]);
  assert.ok(both.includes('>2</th>'),'пропуск между парами разных недель');
});
test('BGTU table result does not depend on the order or types of the source data',()=>{
  const a=[T('odd',1,1,{time:'10:00 - 11:35'}),T('odd',2,1),T('even',3,2,{time:'11:40 - 13:15'}),T('even',1,2)];
  const b=[a[3],a[1],a[0],a[2]];
  assert.equal(sched(a),sched(b),'порядок записей не влияет на разметку');
  const str=[{source:'bgtu',dow:'2',pair:'1',time:'10:00 - 11:35',subjectId:'p1',room:'231'},
             {source:'bgtu',week:'odd',dow:2,pair:1,time:'10:00 - 11:35',subjectId:'p1',room:'231'}];
  assert.ok(sched(str).includes('<b>1</b>'),'строковые номера пар и дней распознаются');
});
test('BGTU table keeps a pair that exists in one week only and shows the free half',()=>{
  const html=sched([T('odd',1,1),T('even',1,2)]);
  assert.ok(html.includes('we alt'),'половинка чётной недели снизу');
  assert.ok(!html.includes('we both'),('одинаковой пары в обе недели нет'));
  const win=sched([T('odd',1,1,{time:'08:00 - 09:35'}),T('odd',2,2,{time:'10:00 - 11:35'}),
                   T('odd',1,3,{time:'12:00 - 13:35'})]);
  assert.ok(win.includes('we win'),'окно между парами одной недели показано');
  assert.ok(win.includes('09:35–12:00'),'окно идёт от конца предыдущей пары до начала следующей');
});
test('BGTU table survives junk: no pairs, no time, unknown day, duplicate rows',()=>{
  const empty=sched([{source:'bgtu',dow:1,pair:0},{source:'bgtu',dow:9,pair:2}]);
  assert.ok(!empty.includes('<table class="bw"'),'мусор без номеров пар не рисует пустую таблицу');
  const noTime=sched([{source:'bgtu',dow:1,pair:1,subjectId:'p1'}]);
  assert.ok(noTime.includes('<b>1</b></th>'),'пара без времени не рисует время в строке');
  const dup=sched([T('odd',1,1),T('odd',1,1,{room:'232'}),T('odd',1,2)]);
  assert.ok(dup.includes('2/0 н/ч'),'дубль одной пары не завышает счётчик в шапке');
  assert.ok(!dup.includes('3/0 н/ч'),'в счётчике именно номера пар, а не записи');
  const sun=sched([T('odd',7,1)]);
  assert.ok(sun.includes('ВС'),'воскресенье не теряется');
  assert.ok(sun.includes('--bwcols:1'),'столбцов ровно столько, сколько дней с парами');
});
test('BGTU table sizes itself by the number of day columns',()=>{
  const html=sched([T('odd',1,1),T('odd',3,1)]);
  assert.ok(html.includes('--bwcols:2'),'два дня с парами - два столбца');
  assert.ok(!html.includes('ВТ'),'пустых столбцов нет');
  assert.ok(html.includes('>1/0 н/ч</small>'),'второй день со своей подписью');
});
