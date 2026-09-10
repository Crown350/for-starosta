const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fetchSchedule,sync,hash}=require('../yandex/bgtu-sync');
const {request}=require('../yandex/bgtu-sync/http');
const html=fs.readFileSync(path.join(__dirname,'fixtures/bgtu.html'),'utf8');
function source(schedule=html){
 const calls=[];
 return {calls,send:async(url,options)=>{
  calls.push({url,...options});
  if(options.method==='GET')return {headers:{'set-cookie':['PHPSESSID=test-session; path=/']},text:'Расписание занятий (чётная неделя)<select id="period"><option selected value="2026-2027_1_1">Семестр</option></select>'};
  assert.match(options.headers.Cookie,/PHPSESSID=test-session/);
  assert.equal(options.headers['X-Requested-With'],'XMLHttpRequest');
  const form=new URLSearchParams(options.body);
  assert.equal(form.get('period'),'2026-2027_1_1');
  if(form.get('namedata')==='group')return {headers:{},text:'<option value="О-26-ИСТ-сии-Б">О-26-ИСТ-сии-Б</option>'};
  assert.equal(form.get('group'),'О-26-ИСТ-сии-Б');assert.equal(form.get('form'),'очная');
  return {headers:{},text:schedule};
 }};
}
test('Yandex parser preserves session and returns 25 real fixture lessons',async()=>{
 const s=source();const data=await fetchSchedule(s.send);assert.equal(data.lessons.length,25);assert.equal(s.calls.length,3);assert.equal(data.lessons.find(r=>r.dow===6).pair,8);
});
test('invalid markup or fewer than ten lessons never publishes a snapshot',async()=>{
 for(const html of ['unavailable','<table class="contless"><tr><td class="daeweek">Понедельник</td></tr><tr><td class="schtime">08:00 - 09:35</td><td class="schname">Алгебра</td></tr></table>']){
  const s=source(html);await assert.rejects(sync({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-key'},send:async(url,options)=>{if(url.includes('claim_yandex_schedule'))return {text:JSON.stringify({acquired:true,cache:{request_token:'test'}})};if(url.includes('finish_yandex_schedule')){const b=JSON.parse(options.body);assert.ok(b.failure);assert.equal(b.snapshot,undefined);return {text:JSON.stringify({cache:{}})};}return s.send(url,options);}}).then(r=>{throw Error(r.error)}),/разметка|минимум 10/);
  assert.ok(s.calls.every(c=>c.url.includes('tu-bryansk.ru')));
 }
});
test('hash ignores object key order; unchanged content still records successful check',async()=>{
 assert.equal(hash({a:1,b:2}),hash({b:2,a:1}));
 const s=source();const previous=await fetchSchedule(s.send);let published;
 const send=async(url,options)=>{
  if(url.includes('tu-bryansk.ru'))return s.send(url,options);
  assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);
  if(url.endsWith('claim_yandex_schedule'))return {text:JSON.stringify({acquired:true,cache:{request_token:'lease',json:previous}})};
  published=JSON.parse(options.body).snapshot;return {text:JSON.stringify({changed:false,cache:{json:previous,fetched_at:published.fetchedAt}})};
 };
 const result=await sync({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'},send,now:()=> '2026-09-10T10:00:00Z'});
 assert.equal(result.changed,false);assert.equal(result.comparedChanged,false);assert.equal(published.fetchedAt,'2026-09-10T10:00:00Z');
});
test('transient HTTP requests get exactly two retries; authorization failures do not',async()=>{
 let calls=0;const transport=async()=>{calls++;return {status:calls<3?503:200};};
 await request('https://example.test',{},transport,async()=>{});assert.equal(calls,3);
 calls=0;await assert.rejects(request('https://example.test',{},async()=>{calls++;return {status:401};},async()=>{}),/401/);assert.equal(calls,1);
 calls=0;await assert.rejects(request('https://example.test',{},async()=>{calls++;throw Object.assign(Error('timeout'),{code:'TIMEOUT'});},async()=>{}));assert.equal(calls,3);
});
test('cached claim does not issue any BGTU request',async()=>{
 const calls=[];
 const result=await sync({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'},send:async(url)=>{
  calls.push(url);assert.ok(url.endsWith('claim_yandex_schedule'));
  return {text:JSON.stringify({acquired:false,cache:{json:{lessons:Array(25).fill({})},fetched_at:'2026-09-10T14:00:00Z',last_attempt_at:'2026-09-10T14:00:00Z'}})};
 }});
 assert.equal(calls.length,1);assert.equal(result.cached,true);assert.equal(result.lessons.length,25);assert.equal(result.changed,false);
});
test('preflight needs no credentials or database request',async()=>{
 const r=await require('../yandex/bgtu-sync').handler({httpMethod:'OPTIONS'});
 assert.equal(r.statusCode,204);assert.equal(r.headers['Access-Control-Allow-Origin'],'https://crown350.github.io');
});
