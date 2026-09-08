const fs=require('node:fs');
const path=require('node:path');
const {getSchedule}=require('../server');
(async()=>{
  let data;
  for(let attempt=1;attempt<=3;attempt++){
    try{data=await getSchedule({});break;}
    catch(e){
      console.error(`БГТУ, попытка ${attempt}/3: ${e.message}; ${e.cause?.code||''}`);
      if(attempt===3)throw e;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
  if(data.mock || data.group.toLowerCase()!=='о-26-ист-сии-б' || data.lessons.length<1)throw new Error('Invalid source');
  const file=path.join(__dirname,'../schedule.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');
  fs.renameSync(file+'.tmp',file);
  console.log(`БГТУ: ${data.lessons.length} занятий, ${data.fetchedAt}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
