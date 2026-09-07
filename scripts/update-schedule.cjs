const fs=require('node:fs');
const path=require('node:path');
const {getSchedule}=require('../server');
(async()=>{
  const data=await getSchedule({});
  if(data.mock || data.group.toLowerCase()!=='о-26-ист-сии-б' || data.lessons.length<1)throw new Error('Invalid source');
  const file=path.join(__dirname,'../schedule.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');
  fs.renameSync(file+'.tmp',file);
  console.log(`БГТУ: ${data.lessons.length} занятий, ${data.fetchedAt}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
