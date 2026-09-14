const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../api-transport.js'),'utf8');
function setup(fetch){const c=vm.createContext({window:{STAROSTA_SUPABASE_URL:'https://functions.yandexcloud.net/test',STAROSTA_SUPABASE_FALLBACK_URL:'https://project.supabase.co'},fetch,Headers,AbortSignal});vm.runInContext(source,c);return c.window.starostaSupabaseFetch;}
const response=(status,marked=true)=>({status,ok:status<400,headers:new Headers(marked?{'x-starosta-proxy':'upstream'}:{})});
test('proxy receives API path and authorization alias; key stays in body',async()=>{
 const call=setup(async(url,options)=>{assert.equal(url,'https://functions.yandexcloud.net/test?path=%2Frest%2Fv1%2Frpc%2Fstarosta_state');assert.equal(options.headers.get('authorization'),null);assert.equal(options.headers.get('x-supabase-authorization'),'Bearer user');assert.equal(options.body,'secret-body');assert.equal(options.cache,'no-store');return response(200);});
 await call('/rest/v1/rpc/starosta_state',{method:'POST',headers:{Authorization:'Bearer user'},body:'secret-body'});
});
test('network failure retries identical revision/body directly once',async()=>{
 let n=0;const call=setup(async(url,o)=>{n++;assert.equal(o.body,'{"expected_revision":12}');if(n===1)throw new TypeError('network');assert.equal(url,'https://project.supabase.co/rest/v1/rpc/starosta_state');assert.equal(o.headers.get('authorization'),'Bearer user');return response(200);});
 await call('/rest/v1/rpc/starosta_state',{method:'POST',headers:{Authorization:'Bearer user'},body:'{"expected_revision":12}'});assert.equal(n,2);
});
test('Supabase auth, conflicts and rate limits never trigger fallback',async()=>{
 for(const code of [401,403,409,429]){let n=0;const call=setup(async()=>{n++;return response(code);});assert.equal((await call('/rest/v1/rpc/starosta_state')).status,code);assert.equal(n,1);}
});
test('Yandex outage falls back, while cancelled requests stay cancelled',async()=>{
 for(const status of [403,502,504]){let n=0;const call=setup(async()=>++n===1?response(status,false):response(200));assert.equal((await call('/functions/v1/fetch-schedule')).status,200);assert.equal(n,2);}
 let n=0;const call=setup(async()=>{n++;throw new Error('aborted')});await assert.rejects(call('/functions/v1/fetch-schedule',{signal:AbortSignal.abort()}));assert.equal(n,1);
});
