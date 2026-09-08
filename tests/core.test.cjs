const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const vm=require('node:vm');
const {parseSchedule,parseCurrentWeek}=require('../server');
const {createCloud}=require('../cloud-server');
test('real BGTU markup: subjects, rooms, blank odd/even slots and pair 8',()=>{
 const rows=parseSchedule(fs.readFileSync(path.join(__dirname,'fixtures/bgtu.html'),'utf8'));
 assert.equal(rows[0].subject,'Основы российской государственности');assert.equal(rows[0].room,'ауд.Д');
 const tue=rows.filter(x=>x.dow===2&&x.pair===1);assert.equal(tue.length,1);assert.equal(tue[0].week,'even');
 const thu=rows.filter(x=>x.dow===4&&x.pair===1);assert.equal(thu.length,1);assert.equal(thu[0].week,'odd');
 assert.equal(rows.find(x=>x.dow===6).pair,8);
 assert.equal(parseCurrentWeek('Расписание занятий (нечётная неделя)'),'odd');
 assert.equal(parseCurrentWeek('Расписание занятий (чётная неделя)'),'even');
 assert.throws(()=>parseCurrentWeek('Service unavailable'));
});
test('calendar parity alternates across Monday, including previous weeks',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const fn=source.slice(source.indexOf('function bgtuCurrentWeekForDate('),source.indexOf('function ensureBGTULessonsForDate('));
 const context=vm.createContext({S:{schedule:{weekAnchor:'2026-09-07',currentWeek:'even'}},todayISO:()=> '2026-09-07'});
 vm.runInContext(fn,context);
 assert.equal(context.bgtuCurrentWeekForDate('2026-09-13'),'even');
 assert.equal(context.bgtuCurrentWeekForDate('2026-09-14'),'odd');
 assert.equal(context.bgtuCurrentWeekForDate('2026-08-31'),'odd');
});
test('cloud authorization, invalid payload, conflicts, persistence and CORS',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'starosta-test-'));
 const old={...process.env};process.env.DATA_DIR=dir;process.env.OWNER_KEY='test-owner-'+ 'x'.repeat(40);process.env.DEPUTY_KEY='test-deputy-'+ 'y'.repeat(40);process.env.ALLOWED_ORIGIN='https://crown350.github.io';
 let server;
 const start=async()=>{const handler=createCloud();server=http.createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;};
 const stop=()=>new Promise(resolve=>server.close(resolve));
 let base=await start();
 const call=(method,key,data,origin)=>fetch(base+'/api/state',{method,headers:{...(key?{Authorization:'Bearer '+key}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 try{
  assert.equal((await call('GET')).status,401);
  assert.equal((await call('PUT',null,{revision:0,data:{}})).status,401);
  assert.equal((await call('GET',process.env.OWNER_KEY,null,'https://evil.example')).status,403);
  assert.equal((await call('PUT',process.env.OWNER_KEY,{revision:0,data:{}})).status,400);
  const data={group:'test',students:[],teachers:[],subjects:[],lessons:[],works:[],funds:[],tpl:[],att:{},subs:{},pays:{},duty:{idx:0,log:[]},schedule:{}};
  const results=await Promise.all([call('PUT',process.env.OWNER_KEY,{revision:0,data}),call('PUT',process.env.DEPUTY_KEY,{revision:0,data})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await (await call('GET',process.env.DEPUTY_KEY)).json()).revision,1);
  await stop();base=await start();assert.deepEqual((await (await call('GET',process.env.OWNER_KEY)).json()).data,data);
  assert.equal((await call('GET',process.env.OWNER_KEY,null,'https://crown350.github.io')).headers.get('access-control-allow-origin'),'https://crown350.github.io');
 }finally{await stop();for(const k of ['DATA_DIR','OWNER_KEY','DEPUTY_KEY','ALLOWED_ORIGIN']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
