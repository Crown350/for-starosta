const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const fn=source.slice(source.indexOf('async function refreshBGTU(){'),source.indexOf('function viewBGTU(){'));
const data={ok:true,lessons:Array(25).fill({subject:'Алгебра'}),fetchedAt:'2026-09-10T14:00:00Z',contentHash:'hash',changed:false};
async function run(result){
 const calls=[];const c=vm.createContext({window:{STAROSTA_YANDEX_FUNCTION_URL:'https://functions.yandexcloud.net/test'},S:{schedule:{fetchedAt:'2026-09-09T00:00:00Z'}},ctx:{},render(){},save(){},toast(){},applyBGTUSchedule(){},AbortController,setTimeout,clearTimeout,TypeError,
 fetch:async(url)=>{assert.equal(c.ctx.bgtuBusy,true);calls.push(url);if(result instanceof Error)throw result;return {ok:true,status:200,json:async()=>result};}});
 vm.runInContext(fn,c);await c.refreshBGTU();assert.deepEqual(calls,['https://functions.yandexcloud.net/test']);assert.equal(c.ctx.bgtuBusy,false);return c;
}
test('manual check contacts Yandex and reports unchanged snapshot',async()=>{const c=await run(data);assert.equal(c.ctx.bgtuMessage,'Обновлено только что');assert.equal(c.S.schedule.fetchedAt,data.fetchedAt);});
test('manual check reports changed snapshot',async()=>{const c=await run({...data,changed:true});assert.equal(c.ctx.bgtuMessage,'Расписание изменилось');});
test('cache message takes precedence over changed flag',async()=>{const c=await run({...data,cached:true,changed:true});assert.equal(c.ctx.bgtuMessage,'Проверено недавно, попробуй через минуту');});
test('manual error preserves timestamp and never falls back to a false success',async()=>{const c=await run(new TypeError('network'));assert.equal(c.ctx.bgtuFailed,true);assert.equal(c.S.schedule.fetchedAt,'2026-09-09T00:00:00Z');assert.match(c.ctx.bgtuMessage,/Yandex/);});
