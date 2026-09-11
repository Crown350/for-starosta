const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'fixtures/bgtu-unsplit.html'),'utf8');
for(const modulePath of ['../server','../yandex/bgtu-sync/parser']){
 test(modulePath+': real unsplit Monday occurs on both weeks, split Tuesday stays even',()=>{
  for(const currentWeek of ['odd','even']){
   const rows=require(modulePath).parseSchedule(html,currentWeek);
   assert.equal(rows.length,25);
   for(const week of ['odd','even']) assert.deepEqual(rows.filter(r=>r.dow===1&&r.week===week).map(r=>r.pair),[1,2,3]);
   assert.deepEqual(rows.filter(r=>r.dow===2&&r.pair===1).map(r=>r.week),['even']);
  }
 });
}
