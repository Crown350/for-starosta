'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'), output=path.join(root,'_site');
const files=require('../site-files.json');
const legal=require('../club/legal.js');
if(!process.argv.includes('--local')&&[legal.terms,legal.policy,legal.consent].some(t=>/\[(ФИО\/наименование оператора|адрес|контактный email)\]/.test(t)))throw Error('Production blocked: fill operator identity, address and email in club/legal.js. Use --local only for an unpublished local preview.');
// A fresh directory prevents a removed asset from surviving a later build.
fs.rmSync(output,{recursive:true,force:true});
for(const file of files){
  if(path.isAbsolute(file)||file.split('/').includes('..'))throw Error('Invalid publish path');
  const target=path.join(output,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(root,file),target);
}
console.log(`Built ${files.length} explicitly listed public files.`);
