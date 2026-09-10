const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const fn=source.slice(source.indexOf('async function loadScheduleSnapshot(){'),source.indexOf('function viewBGTU(){'));
const snapshot={ok:true,lessons:[{subject:'Алгебра'}],fetchedAt:'2026-09-10T10:00:00Z',contentHash:'hash-1'};
const response=data=>({ok:true,json:async()=>data});
async function run(fetch,schedule={}){
 const c=vm.createContext({window:{STAROSTA_SUPABASE_URL:'https://example.supabase.co'},S:{schedule},render(){},save(){},toast(){throw Error('Must stay silent');},applyBGTUSchedule(data){c.applied=data;},AbortController,setTimeout,clearTimeout,fetch});
 vm.runInContext(fn,c);await c.loadScheduleSnapshot();return c;
}
test('automatic snapshot loading uses Edge',async()=>{const urls=[];const c=await run(async url=>{urls.push(url);return response(snapshot);});assert.deepEqual(urls,['https://example.supabase.co/functions/v1/fetch-schedule']);assert.equal(c.applied.contentHash,'hash-1');});
test('fallback is silent when Edge fails',async()=>{const urls=[];const c=await run(async url=>{urls.push(url);if(url!=='./schedule.json')throw Error('network');return response(snapshot);});assert.equal(urls[1],'./schedule.json');assert.equal(c.S.schedule.lastError,'');assert.ok(c.applied);});
test('unchanged snapshot advances freshness without replacing lessons',async()=>{const c=await run(async()=>response(snapshot),{contentHash:'hash-1',fetchedAt:'2026-09-09T10:00:00Z'});assert.equal(c.applied,undefined);assert.equal(c.S.schedule.fetchedAt,snapshot.fetchedAt);});
test('older fallback and failed sources preserve current snapshot',async()=>{const old={fetchedAt:'2026-09-11T10:00:00Z'};let c=await run(async()=>response(snapshot),old);assert.equal(c.applied,undefined);c=await run(async()=>{throw Error('offline');},old);assert.equal(c.S.schedule,old);});
test('invalid empty Edge response tries fallback',async()=>{const c=await run(async url=>response(url==='./schedule.json'?snapshot:{...snapshot,lessons:[]}));assert.ok(c.applied);});
test('view marks only snapshots older than six hours and has no refresh control',()=>{
 const fn=source.slice(source.indexOf('function viewBGTU(){'),source.indexOf('function viewDir(){'));
 const c=vm.createContext({S:{schedule:{fetchedAt:new Date(Date.now()-7*3600000).toISOString()}},head:()=>'',bgtuTpls:()=>[],esc:String});vm.runInContext(fn,c);
 assert.match(c.viewBGTU(),/Снимок старше 6 часов/);assert.match(c.viewBGTU(),/Обновлено:/);assert.doesNotMatch(c.viewBGTU(),/syncbgtu|Обновить расписание/);
 c.S.schedule.fetchedAt=new Date().toISOString();assert.doesNotMatch(c.viewBGTU(),/Снимок старше 6 часов/);
});
