const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const code=source.slice(source.indexOf('let teacherDirectory='),source.indexOf('function teacherDetails'));
const rows=[{short_name:'Алейникова А. О.',full_name:'Алейникова Алина Олеговна',url:'https://example.org/teacher'}];
function setup(cached,fail=false){
 let calls=0,saved;
 const ctx=vm.createContext({Date,render(){},localStorage:{getItem:()=>cached?JSON.stringify(cached):null,setItem:(key,value)=>saved={key,value:JSON.parse(value)}},window:{STAROSTA_SUPABASE_KEY:'public',starostaSupabaseFetch:async(path,options)=>{calls++;assert.match(path,/university=eq.bgtu/);assert.equal(options.headers.apikey,'public');if(fail)throw Error('offline');return {ok:true,json:async()=>rows};}}});
 vm.runInContext(code,ctx);
 return {ctx,get calls(){return calls},get saved(){return saved}};
}
test('directory fetched once and cached; original names resolve unchanged',async()=>{
 const s=setup();await Promise.all([s.ctx.loadTeachers(),s.ctx.loadTeachers()]);assert.equal(s.calls,1);assert.equal(s.saved.key,'starosta.public-teachers.v1:bgtu');assert.equal(s.saved.value.rows.length,1);assert.equal(vm.runInContext("teacherDirectory[teacherKey('Алейникова А.О.')].full",s.ctx),rows[0].full_name);
});
test('fresh cache avoids requests; expired cache survives offline',async()=>{
 const fresh=setup({at:Date.now(),rows});await fresh.ctx.loadTeachers();assert.equal(fresh.calls,0);
 const stale=setup({at:1,rows},true);await stale.ctx.loadTeachers();assert.equal(stale.calls,1);assert.equal(vm.runInContext('Object.keys(teacherDirectory).length',stale.ctx),1);
});
