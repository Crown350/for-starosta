const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const fn=html.slice(html.indexOf('async function syncBGTU(){'),html.indexOf('function viewBGTU(){'));
async function run(protocol,fetch,options={}){
 const c=vm.createContext({window:{STAROSTA_STATIC_SCHEDULE:true,...options.window},location:{protocol},S:{schedule:options.schedule||{}},ctx:{},render(){},save(){},toast(){},applyBGTUSchedule(data){c.applied=data;},URLSearchParams,AbortController,setTimeout,clearTimeout,TypeError,fetch});
 vm.runInContext(fn,c);await c.syncBGTU();return c;
}
test('file opening gives actionable message without fetching',async()=>{const c=await run('file:',()=>{throw Error('Must not fetch');});assert.match(c.ctx.bgtuError,/localhost.*GitHub Pages/);assert.equal(c.ctx.bgtuBusy,false);});
test('missing snapshot gets 404 message before HTML parsing',async()=>{const c=await run('http:',async()=>({status:404,ok:false,json(){throw Error('HTML');}}));assert.match(c.ctx.bgtuError,/404/);});
test('network failure differs from a missing file',async()=>{const c=await run('http:',async()=>{throw new TypeError('Failed to fetch');});assert.match(c.ctx.bgtuError,/Проверь интернет/);assert.doesNotMatch(c.ctx.bgtuError,/404|Failed to fetch/);});

const snapshot={ok:true,lessons:[{subject:'Алгебра'}],fetchedAt:'2026-09-08T20:00:00Z',contentHash:'hash-1',cached:true};
const cloud={STAROSTA_SUPABASE_URL:'https://example.supabase.co'};
const response=data=>({ok:true,status:200,json:async()=>data});
test('Edge is primary, unchanged content refreshes timestamp without rebuilding lessons',async()=>{
 const urls=[];
 const c=await run('https:',async(url,options)=>{urls.push([url,options.method]);return response(snapshot);},{window:cloud,schedule:{contentHash:'hash-1',fetchedAt:'2026-09-08T19:00:00Z'}});
 assert.deepEqual(urls,[['https://example.supabase.co/functions/v1/fetch-schedule','POST']]);assert.equal(c.applied,undefined);assert.equal(c.S.schedule.fetchedAt,snapshot.fetchedAt);assert.match(c.ctx.bgtuNotice,/Обновлено только что/);assert.equal(c.ctx.bgtuBusy,false);
});
test('changed content is applied and announced',async()=>{
 const c=await run('https:',async()=>response(snapshot),{window:cloud});assert.equal(c.applied.contentHash,'hash-1');assert.match(c.ctx.bgtuNotice,/Расписание изменилось/);
});
test('unavailable Edge falls back to snapshot with visible warning',async()=>{
 const urls=[];const c=await run('https:',async url=>{urls.push(url);if(url!=='./schedule.json')throw new TypeError('network');return response(snapshot);},{window:cloud});
 assert.equal(urls[1],'./schedule.json');assert.equal(c.applied.lessons.length,1);assert.match(c.ctx.bgtuError,/резервный снимок/);
});
test('older fallback cannot overwrite newer local timetable',async()=>{
 const c=await run('https:',async url=>{if(url!=='./schedule.json')throw new TypeError('network');return response(snapshot);},{window:cloud,schedule:{fetchedAt:'2026-09-08T21:00:00Z',contentHash:'newer'}});
 assert.equal(c.applied,undefined);assert.equal(c.S.schedule.contentHash,'newer');
});
test('empty Edge response falls back rather than erasing timetable',async()=>{
 const c=await run('https:',async url=>response(url==='./schedule.json'?snapshot:{...snapshot,lessons:[]}),{window:cloud});assert.equal(c.applied.lessons.length,1);assert.match(c.ctx.bgtuError,/резервный/);
});
test('stale snapshot remains visible with error',async()=>{
 const c=await run('https:',async()=>response({...snapshot,error:'Снимок устарел'}),{window:cloud});assert.equal(c.applied.lessons.length,1);assert.equal(c.ctx.bgtuError,'Снимок устарел');
});
