/* Shared verifier: SHA-256 commitment + unbiased rejection sampling. */
((scope)=>{
  'use strict';
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const score=cards=>{let sum=0,aces=0;for(const c of cards){const rank=c%13+1;sum+=rank===1?11:Math.min(rank,10);if(rank===1)aces++;}while(sum>21&&aces-- >0)sum-=10;return sum;};
  async function stream(secret,id,nonce,subtle){let counter=0;return async size=>{
    if(!Number.isSafeInteger(size)||size<1||size>1000000)throw Error('Invalid RNG bound');
    const limit=Math.floor(4294967296/size)*size;
    for(;;){const bytes=await subtle.digest('SHA-256',new TextEncoder().encode(`${secret}:${id}:${nonce}:${counter++}`));const n=new DataView(bytes).getUint32(0);if(n<limit)return n%size;}
  };}
  async function verify(proof,subtle=scope.crypto?.subtle){
    if(!subtle||!proof||!/^[a-f0-9]{64}$/.test(proof.secret)||typeof proof.id!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(proof.id)||typeof proof.nonce!=='string')return false;
    if(hex(new Uint8Array(await subtle.digest('SHA-256',new TextEncoder().encode(proof.secret))))!==proof.commitment)return false;
    const draw=await stream(proof.secret,proof.id,proof.nonce,subtle);
    const paid=ratio=>proof.multiplier===ratio&&Number.isSafeInteger(proof.amount)&&proof.amount>0&&proof.payout===Math.floor(proof.amount*ratio/10000);
    if(proof.game==='coin'){const index=await draw(2),result=index===0?'heads':'tails';return proof.index===index&&proof.result===result&&['heads','tails'].includes(proof.choice)&&paid(proof.choice===result?20000:0);}
    if(proof.game==='numbers'){const number=await draw(12)+1;if(proof.number!==number)return false;let won,ratio;if(['red','white'].includes(proof.choice)){ratio=20000;won=proof.choice===(number%2?'red':'white');}else{if(!Array.isArray(proof.numbers)||!proof.numbers.length||proof.numbers.length>12||new Set(proof.numbers).size!==proof.numbers.length||!proof.numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=12))return false;ratio=Math.floor(120000/proof.numbers.length);won=proof.numbers.includes(number);}return paid(won?ratio:0);}
    if(proof.game==='gift')return await draw(10000)===proof.draw;
    if(proof.game==='multiplier'){
      const n=await draw(10000),rules=proof.rules;if(proof.draw!==n||!rules||!Array.isArray(rules.weights)||rules.weights.length!==6||!rules.weights.every(w=>Number.isInteger(w)&&w>0)||rules.weights.reduce((a,b)=>a+b,0)!==10000||JSON.stringify(rules.multipliers)!=='[0,5000,10000,15000,20000,50000]')return false;
      let cursor=n,index=0;while(cursor>=rules.weights[index])cursor-=rules.weights[index++];return proof.index===index&&paid(rules.multipliers[index]);
    }
    if(proof.game==='blackjack'||proof.game==='team21'){
      const deck=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=await draw(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
      if(!Array.isArray(proof.draws)||proof.draws.length<4||proof.draws.length>52||!proof.draws.every((card,i)=>card===deck[i])||!Array.isArray(proof.actions))return false;
      const player=deck.slice(0,2),dealer=deck.slice(2,4);let cursor=4,finished=score(player)===21||score(dealer)===21;
      const dealerFinish=()=>{while(score(dealer)<17)dealer.push(deck[cursor++]);finished=true;};
      for(const action of proof.actions){if(finished)return false;if(action==='hit'){player.push(deck[cursor++]);if(score(player)>=21)dealerFinish();}else if(action==='stand')dealerFinish();else if(action==='double'&&proof.game==='blackjack'&&player.length===2){player.push(deck[cursor++]);dealerFinish();}else return false;}
      if(!finished||cursor!==proof.draws.length||JSON.stringify(player)!==JSON.stringify(proof.player)||JSON.stringify(dealer)!==JSON.stringify(proof.dealer))return false;
      const a=score(player),b=score(dealer),natural=proof.actions.length===0;let ratio,outcome;
      if(natural){if(a===21&&b===21){ratio=10000;outcome='Два 21 — ничья';}else if(b===21){ratio=0;outcome='21 дилера';}else{ratio=25000;outcome='21 с первых двух карт';}}
      else if(a>21){ratio=0;outcome='Перебор';}else if(b>21){ratio=20000;outcome='Перебор дилера';}else if(a>b){ratio=20000;outcome=a===21?'21 — победа':'Победа';}else if(a===b){ratio=10000;outcome='Ничья';}else{ratio=0;outcome='Победа дилера';}
      return proof.outcome===outcome&&paid(ratio);
    }
    return false;
  }
  const api={verify,score,stream};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.ClubFairness=api;
})(typeof globalThis!=='undefined'?globalThis:this);
