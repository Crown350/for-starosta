// Preserve the last deployed snapshot when BGTU is temporarily unavailable.
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const res=await fetch('https://crown350.github.io/for-starosta/schedule.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error(`Snapshot: HTTP ${res.status}`);
  const data=await res.json();
  if(!data.ok||data.mock||data.group?.toLowerCase()!=='о-26-ист-сии-б'||!data.lessons?.length||!Number.isFinite(Date.parse(data.fetchedAt)))throw new Error('Invalid snapshot');
  const file=path.join(__dirname,'../schedule.json');
  const current=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Date.parse(data.fetchedAt)>Date.parse(current.fetchedAt))fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  console.log(`Сохранён опубликованный снимок: ${data.lessons.length} занятий, ${data.fetchedAt}`);
})().catch(e=>{console.warn(e.message);process.exitCode=1;});
