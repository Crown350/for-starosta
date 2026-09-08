// Authenticate the main Pages workflow with a short-lived GitHub OIDC token.
const fs=require('node:fs');
const path=require('node:path');
const endpoint='https://piwxslgxwmdrehnomymt.supabase.co/functions/v1/publish-schedule';
(async()=>{
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience',endpoint);
  const auth=await fetch(url,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(15000)});
  if(!auth.ok)throw new Error(`OIDC: HTTP ${auth.status}`);
  const {value}=await auth.json();
  if(!value)throw new Error('Missing OIDC token');
  const res=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${value}`,'Content-Type':'application/json'},
    body:fs.readFileSync(path.join(__dirname,'../schedule.json'),'utf8'),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(`Publish schedule: HTTP ${res.status}`);
  const result=await res.json();
  if(!result.ok)throw new Error('Snapshot rejected');
  console.log(`Supabase: ${result.lessons||'cached'} занятий, изменилось: ${result.changed}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
