'use strict';
const crypto=require('node:crypto');
const {score}=require('../../club/fairness.js');
function stream(secret,id,nonce){let counter=0;return size=>{
  if(!Number.isSafeInteger(size)||size<1||size>1000000)throw Error('Invalid RNG bound');
  const limit=Math.floor(4294967296/size)*size;
  for(;;){const n=crypto.createHash('sha256').update(`${secret}:${id}:${nonce}:${counter++}`).digest().readUInt32BE(0);if(n<limit)return n%size;}
};}
function deck(secret,id,nonce){const draw=stream(secret,id,nonce),cards=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=draw(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
const commitment=secret=>crypto.createHash('sha256').update(secret).digest('hex');
module.exports={stream,deck,commitment,score};
