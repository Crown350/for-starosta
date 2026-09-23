const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../v2/app.js'),'utf8');
function section(from,to){return app.slice(app.indexOf(from),app.indexOf(to));}
const code=[
  section('function esc(', 'function todayISO('),
  section('function fmtDate(', 'function dowOf('),
  section('function head(', '/* ---------- СЕГОДНЯ'),
  section('function viewPairs(', '/* ---------- СДАЧИ'),
  section('const IMPORT_MODES =', 'function parseRaw('),
].join('\n');

function renderDates(date,kind){
  const lesson={id:'l1',date,pair:1,subjectId:'p1',kind:'лекция',room:''};
  const c=vm.createContext({
    S:{group:'Тест',lessons:[lesson],students:[],att:{},schedule:{}},
    ctx:{lesson:'l1',imode:'marks'},curDate:date,scheduleLoading:false,
    // Keep calendar/schedule services out of this rendering-boundary test.
    dowOf:()=>1,DOW:['вс','пн','вт','ср','чт','пт','сб'],
    ensureBGTULessonsForDate(){},bgtuCurrentWeekForDate:()=>'odd',bgtuWeekLabel:()=>'нечётная',
    lessonsOn:()=>kind==='import'||kind==='emptyPairs'?[]:[lesson],
    subjName:()=>'Алгебра',attOf:()=>({}),lessonLocation:()=>'',icon:()=>'',
    plural:n=>n+' пара',window:{cloudCanEdit:()=>kind!=='readerPairs'},
  });
  vm.runInContext(code,c);
  const html=kind==='att'?c.viewAtt():kind==='import'?c.viewImport():c.viewPairs();
  return {html,formatted:c.fmtDate(date)};
}

const cases=[
  ['"><img src=x onerror=alert(1)>','&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'],
  ['<svg onload=alert(1)>','&lt;svg onload=alert(1)&gt;'],
  ['\' autofocus onfocus=alert(1) x="','&#39; autofocus onfocus=alert(1) x=&quot;'],
  ['&lt;svg onload=alert(1)&gt;','&amp;lt;svg onload=alert(1)&amp;gt;'],
];
const kinds=['att','import','pairs','readerPairs','emptyPairs'];
for(const kind of kinds)test(`${kind}: untrusted dates remain encoded data, never markup`,()=>{
  const baseline=renderDates('2026-09-23',kind).html;
  for(const [payload,encoded] of cases){
    const {html,formatted}=renderDates(payload,kind);
    assert.ok(html.includes(encoded),`missing encoded payload: ${payload}`);
    assert.doesNotMatch(html,/<(?:img|svg)\b/i);
    // Scan only markup: event-looking text inside escaped data is harmless.
    for(const tag of html.match(/<[^>]*>/g)||[]){
      const markup=tag.replace(/"[^"]*"|'[^']*'/g,'""');
      assert.doesNotMatch(markup,/\s(?:on\w+|autofocus)\s*(?:=|>)/i);
    }
    // Exact equality after replacing only the date slots proves no new markup
    // or attributes appeared, including quote/attribute injection without tags.
    assert.equal(html.replaceAll('undefined.undefined.'+encoded,'23.09.2026').replaceAll(encoded,'2026-09-23'),baseline);
    assert.equal(formatted,'undefined.undefined.'+payload,'plain formatter must stay suitable for text exports');
  }
});
test('esc encodes all five HTML metacharacters exactly once',()=>{
  const c=vm.createContext({});vm.runInContext(section('function esc(', 'function todayISO('),c);
  assert.equal(c.esc('&<>"\''),'&amp;&lt;&gt;&quot;&#39;');
  assert.equal(c.esc(null),'');assert.equal(c.esc('обычный текст'),'обычный текст');
});
test('normal dates and attendance edit action remain intact',()=>{
  for(const kind of kinds){
    const {html,formatted}=renderDates('2026-09-23',kind);
    assert.equal(formatted,'23.09.2026');
    if(kind!=='emptyPairs')assert.ok(html.includes('23.09.2026'));
    if(kind.includes('Pairs')||kind==='pairs')assert.ok(html.includes('value="2026-09-23"'));
    if(kind==='att')assert.ok(html.includes('data-act="editlesson"'));
  }
});
module.exports={renderDates,cases,kinds};
