'use strict';
const categories=['theme','frame','badge','table','sound','card','wheel','animation'];
const config={version:1,ticketIntervalMs:86400000,pity:8,predictionDurationMs:45000,
  rewards:[{id:'glow',label:'Тёплый свет',sparks:50,weight:7000,rare:false},{id:'flare',label:'Яркая вспышка',sparks:90,weight:2500,rare:false},{id:'aurora',label:'Полярная звезда',sparks:120,itemId:'badge-aurora',weight:500,rare:true}],
  transfers:{enabled:true,minAccountAgeMs:86400000,maxAmount:100,daily:200,weekly:600,previewTtlMs:300000},
  games:{minAmount:2,maxAmount:100,amountStep:2,roundTtlMs:300000,turnMs:30000,presenceMs:20000,
    coin:{probabilities:[5000,5000],payout:20000},
    numbers:{sectors:12,weights:Array(12).fill(1),colorPayout:20000,numberPayout:120000},
    multiplier:{weights:[2000,2000,3000,1500,1000,500],multipliers:[0,5000,10000,15000,20000,50000]},
    blackjack:{win:20000,natural:25000,push:10000,loss:0,dealerStand:17}},
  catalogue:[
    {id:'theme-moss',name:'Лесной свет',category:'theme',price:40,rarity:'Обычный',effect:'moss',preview:'Зелёные акценты'},
    {id:'theme-lilac',name:'Сиреневый вечер',category:'theme',price:80,rarity:'Редкий',effect:'lilac',preview:'Сиреневые акценты'},
    {id:'frame-orbit',name:'Орбита',category:'frame',price:40,rarity:'Обычный',effect:'orbit',preview:'Тонкое кольцо профиля'},
    {id:'frame-prism',name:'Призма',category:'frame',price:80,rarity:'Редкий',effect:'prism',preview:'Переливчатая рамка'},
    {id:'badge-leaf',name:'Первый росток',category:'badge',price:40,rarity:'Обычный',effect:'leaf',preview:'Личный значок ростка'},
    {id:'badge-aurora',name:'Полярная звезда',category:'badge',price:120,rarity:'Редкий',effect:'aurora',preview:'Личный значок звезды'},
    {id:'table-moss',name:'Лесные линии',category:'table',price:40,rarity:'Обычный',effect:'moss',preview:'Зелёный акцент таблицы'},
    {id:'table-lilac',name:'Сиреневые линии',category:'table',price:80,rarity:'Редкий',effect:'lilac',preview:'Сиреневый акцент таблицы'},
    {id:'sound-bell',name:'Тихий колокольчик',category:'sound',price:40,rarity:'Обычный',effect:'bell',preview:'Короткий мягкий тон'},
    {id:'sound-chime',name:'Созвучие',category:'sound',price:80,rarity:'Редкий',effect:'chime',preview:'Два мягких тона'},
    {id:'card-moss',name:'Лесная рубашка',category:'card',price:40,rarity:'Обычный',effect:'moss',preview:'Зелёная рубашка карт'},
    {id:'card-lilac',name:'Сиреневая рубашка',category:'card',price:80,rarity:'Редкий',effect:'lilac',preview:'Сиреневая рубашка карт'},
    {id:'wheel-moss',name:'Лесное колесо',category:'wheel',price:40,rarity:'Обычный',effect:'moss',preview:'Зелёные линии колеса'},
    {id:'wheel-lilac',name:'Сиреневое колесо',category:'wheel',price:80,rarity:'Редкий',effect:'lilac',preview:'Сиреневые линии колеса'},
    {id:'animation-bloom',name:'Раскрытие света',category:'animation',price:40,rarity:'Обычный',effect:'bloom',preview:'Плавное раскрытие награды'}]};
config.catalogue.forEach(i=>i.description=i.preview+'. Только личное декоративное оформление.');
function validate(c){
  const id=s=>typeof s==='string'&&/^[a-z][a-z0-9-]{1,40}$/.test(s);
  const text=s=>typeof s==='string'&&s.length>0&&s.length<=100&&!/[<>]|https?:|javascript:|data:/i.test(s);
  if(c.version!==1||!Number.isSafeInteger(c.pity)||c.pity<1||c.pity>100||!Number.isSafeInteger(c.ticketIntervalMs)||c.ticketIntervalMs<60000||!Number.isSafeInteger(c.predictionDurationMs)||c.predictionDurationMs<1000)throw Error('Invalid economy');
  if(!Array.isArray(c.catalogue)||!c.catalogue.length||new Set(c.catalogue.map(i=>i.id)).size!==c.catalogue.length)throw Error('Invalid catalogue');
  const effects={theme:['moss','lilac'],frame:['orbit','prism'],badge:['leaf','aurora'],table:['moss','lilac'],sound:['bell','chime'],card:['moss','lilac'],wheel:['moss','lilac'],animation:['bloom']};
  for(const i of c.catalogue)if(!id(i.id)||!categories.includes(i.category)||!effects[i.category].includes(i.effect)||!text(i.name)||!text(i.preview)||!text(i.description)||!['Обычный','Редкий'].includes(i.rarity)||!Number.isSafeInteger(i.price)||i.price<1||i.price>10000||Object.keys(i).some(k=>!['id','name','category','price','rarity','effect','preview','description'].includes(k)))throw Error('Invalid item');
  const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const t=c.transfers,g=c.games;
  if(!t||typeof t.enabled!=='boolean'||!int(t.minAccountAgeMs,0,604800000)||!int(t.maxAmount,1,10000)||!int(t.daily,t.maxAmount,100000)||!int(t.weekly,t.daily,1000000)||!int(t.previewTtlMs,1000,3600000))throw Error('Invalid transfers');
  if(!g||!int(g.minAmount,2,100)||!int(g.maxAmount,g.minAmount,10000)||g.amountStep!==2||!int(g.roundTtlMs,1000,3600000)||!int(g.turnMs,1000,g.roundTtlMs)||!int(g.presenceMs,1000,g.roundTtlMs))throw Error('Invalid games');
  if(JSON.stringify(g.coin.probabilities)!=='[5000,5000]'||g.coin.payout!==20000||g.numbers.sectors!==12||g.numbers.weights.length!==12||!g.numbers.weights.every(n=>n===1)||g.numbers.colorPayout!==20000||g.numbers.numberPayout!==120000)throw Error('Invalid fixed odds');
  if(g.multiplier.weights.length!==6||!g.multiplier.weights.every(n=>int(n,1,10000))||g.multiplier.weights.reduce((a,b)=>a+b,0)!==10000||JSON.stringify(g.multiplier.multipliers)!=='[0,5000,10000,15000,20000,50000]')throw Error('Invalid multiplier');
  if(g.blackjack.win!==20000||g.blackjack.natural!==25000||g.blackjack.push!==10000||g.blackjack.loss!==0||g.blackjack.dealerStand!==17)throw Error('Invalid blackjack');
  if(!Array.isArray(c.rewards)||new Set(c.rewards.map(r=>r.id)).size!==c.rewards.length||c.rewards.reduce((n,r)=>n+r.weight,0)!==10000||!c.rewards.some(r=>r.rare))throw Error('Invalid probabilities');
  for(const r of c.rewards)if(!id(r.id)||!text(r.label)||!Number.isSafeInteger(r.weight)||r.weight<1||!Number.isSafeInteger(r.sparks)||r.sparks<1||typeof r.rare!=='boolean'||(r.itemId&&!c.catalogue.some(i=>i.id===r.itemId)))throw Error('Invalid reward');
  return c;
}
validate(config);
module.exports={config,validate,categories};
