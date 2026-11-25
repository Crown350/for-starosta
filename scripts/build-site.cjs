'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'), output=path.join(root,'_site');
const files=require('../site-files.json');
const legal=require('../club/legal.js');
const hostedPreview=process.argv.includes('--hosted-club-preview');
const hostedApi='https://piwxslgxwmdrehnomymt.supabase.co/functions/v1/game-club/';
if(!hostedPreview&&!process.argv.includes('--local')&&[legal.terms,legal.policy,legal.consent].some(t=>/\[(ФИО\/наименование оператора|адрес|контактный email)\]/.test(t)))throw Error('Production blocked: fill operator identity, address and email in club/legal.js. Use --local only for an unpublished local preview.');
// A fresh directory prevents a removed asset from surviving a later build.
fs.rmSync(output,{recursive:true,force:true});
for(const file of files){
  if(path.isAbsolute(file)||file.split('/').includes('..'))throw Error('Invalid publish path');
  const target=path.join(output,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const source=path.join(root,file);
  if(hostedPreview&&file==='club/index.html'){
    const html=fs.readFileSync(source,'utf8')
      .replace("connect-src 'self';","connect-src 'self' "+new URL(hostedApi).origin+";")
      .replace('<meta name="referrer"', '<meta name="starosta-club-api" content="'+hostedApi+'">\n<meta name="referrer"')
      .replace('подключение к локальному API','подключение к серверу клуба');
    fs.writeFileSync(target,html,'utf8');
  }else fs.copyFileSync(source,target);
}
console.log(`Built ${files.length} explicitly listed public files.`);
