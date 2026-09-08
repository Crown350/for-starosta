const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fn=html.slice(html.indexOf('async function syncBGTU(){'),html.indexOf('function viewBGTU(){'));
async function run(protocol,fetch){
 const c=vm.createContext({window:{STAROSTA_STATIC_SCHEDULE:true},location:{protocol},S:{schedule:{}},ctx:{},render(){},save(){},toast(){},URLSearchParams,AbortController,setTimeout,clearTimeout,TypeError,fetch});
 vm.runInContext(fn,c);await c.syncBGTU();return c;
}
test('file opening gives actionable message without fetching',async()=>{const c=await run('file:',()=>{throw Error('Must not fetch');});assert.match(c.ctx.bgtuError,/localhost.*GitHub Pages/);assert.equal(c.ctx.bgtuBusy,false);});
test('missing snapshot gets 404 message before HTML parsing',async()=>{const c=await run('http:',async()=>({status:404,ok:false,json(){throw Error('HTML');}}));assert.match(c.ctx.bgtuError,/404/);});
test('network failure differs from a missing file',async()=>{const c=await run('http:',async()=>{throw new TypeError('Failed to fetch');});assert.match(c.ctx.bgtuError,/Проверь интернет/);assert.doesNotMatch(c.ctx.bgtuError,/404|Failed to fetch/);});
