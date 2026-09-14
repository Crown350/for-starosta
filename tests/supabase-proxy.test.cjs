const {test}=require('node:test');const assert=require('node:assert/strict');
const {proxy}=require('../yandex/supabase-proxy');
const event={httpMethod:'POST',queryStringParameters:{path:'/rest/v1/rpc/starosta_state'},headers:{apikey:'public-test','Content-Type':'application/json','X-Supabase-Authorization':'Bearer caller'},body:'{"access_key":"test","operation":"read"}'};
test('proxy preserves method, path, body, caller credentials and upstream errors',async()=>{
 for(const method of ['GET','HEAD','POST','PATCH','PUT','DELETE']){
  const r=await proxy({...event,httpMethod:method},async(url,options,body)=>{
   assert.equal(url.href,'https://piwxslgxwmdrehnomymt.supabase.co/rest/v1/rpc/starosta_state');assert.equal(options.method,method);
   assert.equal(options.headers.apikey,'public-test');assert.equal(options.headers.authorization,'Bearer caller');
   assert.equal(body?.toString(),['GET','HEAD'].includes(method)?undefined:event.body);
   return {status:409,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:Buffer.from('conflict')};
  });
  assert.equal(r.statusCode,409);assert.equal(Buffer.from(r.body,'base64').toString(),method==='HEAD'?'':'conflict');assert.equal(r.headers['Access-Control-Allow-Origin'],'https://crown350.github.io');
 }
});
test('preflight and invalid destinations never contact upstream',async()=>{
 const never=()=>{throw Error('must not run')};assert.equal((await proxy({...event,httpMethod:'OPTIONS'},never)).statusCode,204);
 for(const path of ['https://evil.test/','//evil.test/','/\\evil.test/'])assert.equal((await proxy({...event,queryStringParameters:{path}},never)).statusCode,400);
});
test('binary bytes and query filters survive; no credentials are manufactured',async()=>{
 const r=await proxy({httpMethod:'POST',queryStringParameters:{path:'/rest/v1/x?a=eq.1&a=eq.2'},body:'AP8=',isBase64Encoded:true},async(url,options,body)=>{
 assert.equal(url.search,'?a=eq.1&a=eq.2');assert.deepEqual(options.headers,{});assert.deepEqual([...body],[0,255]);return {status:200,headers:{},body};});assert.equal(r.body,'AP8=');
});
test('upstream failure returns CORS, never logs request data',async()=>{const r=await proxy(event,async()=>{throw Error('secret')});assert.equal(r.statusCode,502);assert.ok(!r.body.includes('secret'));assert.ok(r.headers['Access-Control-Allow-Origin']);});
