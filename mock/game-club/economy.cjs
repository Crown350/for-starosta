'use strict';
const crypto=require('node:crypto');
const fair=require('./fairness.cjs');
const fail=(code,status=409)=>{const error=Error(code);error.code=code;error.status=status;throw error;};
const FIXTURES={demo:'Светлана', 'demo-two':'Максим', 'demo-three':'Лена', 'demo-four':'Илья'};
const specs={welcome:[],transferPreview:['recipientId','amount','comment'],transfer:['previewId'],prepare:['game'],start:['roundId','amount','choice','numbers','nonce'],act21:['roundId','action','version'],cancelRound:['roundId'],roomCreate:[],roomJoin:['code','amount','nonce'],roomStart:['code','version'],roomAct:['code','action','version'],roomLeave:['code','version']};
const isId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
class Economy{
  constructor(engine){this.e=engine;}
  init(data){
    data.rounds??={};data.rooms??={};data.previews??={};data.ledger??=[];
    for(const [id,u]of Object.entries(data.users)){u.name??=FIXTURES[id];u.createdAt??=this.e.now()-8*86400000;u.reserved??=0;u.welcome??=false;
      if(!data.ledger.some(l=>l.account===id))this.post(data,id,0,0,'Начальный снимок',null,{opening:u.balance});
    }
  }
  post(data,id,delta,reserveDelta,reason,roundId=null,extra={}){
    const u=this.e.user(data,id);if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(reserveDelta)||!Number.isSafeInteger(u.balance+delta)||u.balance+delta<0||u.reserved+reserveDelta<0)fail('INSUFFICIENT_SPARKS');
    u.balance+=delta;u.reserved+=reserveDelta;
    const entry={id:crypto.randomUUID(),account:id,at:this.e.now(),delta,reserveDelta,balance:u.balance,reserved:u.reserved,reason,roundId,...extra};data.ledger.push(entry);return entry;
  }
  check(data){for(const [id,u]of Object.entries(data.users)){
    const total=data.ledger.filter(l=>l.account===id).reduce((n,l)=>n+l.delta+l.reserveDelta+(l.opening||0),0);
    if(total!==u.balance+u.reserved||u.balance<0||u.reserved<0)throw Error('Ledger invariant');
  }}
  amount(n){const g=this.e.config.games;if(!Number.isSafeInteger(n)||n<g.minAmount||n>g.maxAmount||n%g.amountStep)fail('INVALID_AMOUNT',400);return n;}
  seedRound(data,owner,game){
    if(!['coin','numbers','multiplier','blackjack','team21','gift'].includes(game))fail('INVALID_GAME',400);
    const secret=this.e.secretFactory();if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid secret');
    const r={id:crypto.randomUUID(),owner,game,secret,commitment:fair.commitment(secret),status:'prepared',version:0,amount:0,createdAt:this.e.now(),expiresAt:this.e.now()+this.e.config.games.roundTtlMs,config:structuredClone(this.e.config.games),draws:[]};data.rounds[r.id]=r;return r;
  }
  publicRound(r){const {secret,deck,config,...visible}=r;
    if(r.status==='active'&&['blackjack','team21'].includes(r.game))return JSON.parse(JSON.stringify({...visible,draws:undefined,dealer:[r.dealer[0]],playerTotal:fair.score(r.player),dealerTotal:null}));
    const out={...visible};if(r.status==='settled')out.proof={secret,commitment:r.commitment,id:r.id,nonce:r.nonce,game:r.game,draws:r.draws,index:r.index,number:r.number,draw:r.draw,result:r.result,choice:r.choice,numbers:r.numbers,amount:r.amount,multiplier:r.multiplier,payout:r.payout,player:r.player,dealer:r.dealer,actions:r.actions,outcome:r.outcome,rules:r.game==='multiplier'?r.config.multiplier:undefined};
    if(r.player)out.playerTotal=fair.score(r.player);if(r.dealer)out.dealerTotal=fair.score(r.dealer);return JSON.parse(JSON.stringify(out));
  }
  mine(data,id,roundId){if(!isId(roundId))fail('INVALID_ROUND',400);const r=data.rounds[roundId];if(!r||r.owner!==id||r.game==='team21')fail('ROUND_NOT_FOUND',404);return r;}
  hold(data,id,r,amount){this.post(data,id,-amount,amount,'Резерв для раунда',r.id);r.amount+=amount;}
  settle(data,r,multiplier,outcome){
    if(r.status==='settled'||r.status==='cancelled')fail('ROUND_FINISHED');r.status='settled';r.outcome=outcome;r.multiplier=multiplier;r.payout=Math.floor(r.amount*multiplier/10000);r.finishedAt=this.e.now();r.version++;
    if(r.game==='team21'){
      const room=Object.values(data.rooms).find(room=>room.roundId===r.id);room.status='settled';room.version++;
      r.settlements=room.members.filter(p=>p.amount>0).map(p=>{const payout=Math.floor(p.amount*multiplier/10000);this.post(data,p.user,payout,-p.amount,'Результат командной 21: '+outcome,r.id);return {account:p.user,amount:p.amount,payout,net:payout-p.amount,after:data.users[p.user].balance};});
    }else{this.post(data,r.owner,r.payout,-r.amount,'Результат '+r.game+': '+outcome,r.id);r.after=data.users[r.owner].balance;}
  }
  cancel(data,r){
    if(!['prepared','active'].includes(r.status))fail('ROUND_FINISHED');
    if(r.game==='team21'){const room=Object.values(data.rooms).find(x=>x.roundId===r.id);for(const p of room.members)if(p.amount>0)this.post(data,p.user,p.amount,-p.amount,'Возврат зависшего резерва',r.id);room.status='cancelled';room.version++;}
    else if(r.amount>0)this.post(data,r.owner,r.amount,-r.amount,'Возврат зависшего резерва',r.id);
    r.status='cancelled';r.version++;r.finishedAt=this.e.now();
  }
  card(r,to){const card=r.deck[r.draws.length];if(card===undefined)throw Error('Empty deck');r.draws.push(card);r[to].push(card);}
  deal(r,nonce){r.nonce=nonce;r.deck=fair.deck(r.secret,r.id,nonce);r.player=[];r.dealer=[];r.actions=[];this.card(r,'player');this.card(r,'player');this.card(r,'dealer');this.card(r,'dealer');r.status='active';r.version++;}
  stand(data,r){while(fair.score(r.dealer)<r.config.blackjack.dealerStand)this.card(r,'dealer');const a=fair.score(r.player),b=fair.score(r.dealer),c=r.config.blackjack;
    if(a>21)this.settle(data,r,c.loss,'Перебор');else if(b>21)this.settle(data,r,c.win,'Перебор дилера');else if(a>b)this.settle(data,r,c.win,a===21?'21 — победа':'Победа');else if(a===b)this.settle(data,r,c.push,'Ничья');else this.settle(data,r,c.loss,'Победа дилера');
  }
  natural(data,r){const a=fair.score(r.player),b=fair.score(r.dealer),c=r.config.blackjack;if(a===21&&b===21)this.settle(data,r,c.push,'Два 21 — ничья');else if(b===21)this.settle(data,r,c.loss,'21 дилера');else if(a===21)this.settle(data,r,c.natural,'21 с первых двух карт');}
  advance(data,r,action,id){
    if(action==='double'){
      if(r.game!=='blackjack'||r.player.length!==2||r.amount*2>r.config.maxAmount)fail('DOUBLE_NOT_ALLOWED');r.actions.push(action);this.hold(data,id,r,r.amount);this.card(r,'player');this.stand(data,r);
    }else if(action==='stand'){r.actions.push(action);this.stand(data,r);}
    else if(action==='hit'){r.actions.push(action);this.card(r,'player');r.version++;if(fair.score(r.player)>=21)this.stand(data,r);}
    else fail('INVALID_ACTION',400);
  }
  sweep(data){let changed=false;const now=this.e.now();for(const r of Object.values(data.rounds))if(['prepared','active'].includes(r.status)&&now>=r.expiresAt){this.cancel(data,r);changed=true;}
    for(const room of Object.values(data.rooms))if(room.status==='active'){
      for(const m of room.members){const online=now-m.lastSeen<=this.e.config.games.presenceMs;if(m.online!==online){m.online=online;changed=true;}}
      if(now>=room.turnEndsAt){const eligible=room.members.map((m,i)=>m.online&&m.amount>0?i:-1).filter(i=>i>=0);if(eligible.length){const next=eligible.find(i=>i>room.turn)??eligible[0];room.turn=next;}room.turnEndsAt=now+this.e.config.games.turnMs;room.version++;changed=true;}
    }return changed;
  }
  limits(data,id){const now=this.e.now(),entries=data.ledger.filter(l=>l.account===id&&l.kind==='transfer-out');return {daily:entries.filter(l=>l.at>now-86400000).reduce((n,l)=>n-l.delta,0),weekly:entries.filter(l=>l.at>now-604800000).reduce((n,l)=>n-l.delta,0)};}
  transferCheck(data,id,recipient,amount){const c=this.e.config.transfers,u=this.e.user(data,id);if(!c.enabled)fail('TRANSFERS_DISABLED');if(id===recipient)fail('SELF_TRANSFER');if(!Object.hasOwn(FIXTURES,recipient))fail('RECIPIENT_NOT_FOUND',404);
    const target=this.e.user(data,recipient);if(this.e.now()-u.createdAt<c.minAccountAgeMs||this.e.now()-target.createdAt<c.minAccountAgeMs)fail('ACCOUNT_TOO_NEW');
    if(!Number.isSafeInteger(amount)||amount<1||amount>c.maxAmount)fail('INVALID_AMOUNT',400);const used=this.limits(data,id);if(used.daily+amount>c.daily||used.weekly+amount>c.weekly)fail('TRANSFER_LIMIT');if(u.balance<amount)fail('INSUFFICIENT_SPARKS');return target;
  }
  room(data,id,code){if(typeof code!=='string'||!/^[-A-Z0-9]{8}$/.test(code))fail('INVALID_ROOM',400);const room=data.rooms[code];if(!room)fail('ROOM_NOT_FOUND',404);if(!room.members.some(m=>m.user===id))fail('ROOM_FORBIDDEN',403);return room;}
  command(data,id,input,receipt){const e=this.e,u=e.user(data,id),now=e.now();
    switch(input.type){
      case 'welcome': if(u.welcome)fail('ALREADY_CLAIMED');u.welcome=true;this.post(data,id,200,0,'Бесплатная награда за первый вход в клуб');receipt.reason='Первый шаг в клубе';break;
      case 'transferPreview': {const target=this.transferCheck(data,id,input.recipientId,input.amount);const comment=input.comment??'';if(typeof comment!=='string'||comment.length>140||/[\x00-\x08\x0b-\x1f]/.test(comment))fail('INVALID_COMMENT',400);const p={id:crypto.randomUUID(),owner:id,recipientId:input.recipientId,name:target.name,amount:input.amount,comment,expiresAt:now+e.config.transfers.previewTtlMs,used:false};data.previews[p.id]=p;receipt.preview={...p};receipt.reason='Перевод подготовлен';break;}
      case 'transfer': {if(!isId(input.previewId))fail('INVALID_PREVIEW',400);const p=data.previews[input.previewId];if(!p||p.owner!==id)fail('PREVIEW_NOT_FOUND',404);if(p.used)fail('PREVIEW_USED');if(now>=p.expiresAt)fail('PREVIEW_EXPIRED');const target=this.transferCheck(data,id,p.recipientId,p.amount);p.used=true;const tx=crypto.randomUUID();this.post(data,id,-p.amount,0,'Перевод для '+target.name,null,{kind:'transfer-out',transferId:tx,recipientId:p.recipientId,comment:p.comment});const incoming=this.post(data,p.recipientId,p.amount,0,'Перевод от '+u.name,null,{kind:'transfer-in',transferId:tx,senderId:id,comment:p.comment});target.history.push({...incoming,type:'transfer-in'});receipt.reason='Перевод для '+target.name;receipt.comment=p.comment;receipt.transferId=tx;receipt.recipientId=p.recipientId;break;}
      case 'prepare': {if(Object.values(data.rounds).some(r=>r.owner===id&&r.game!=='gift'&&r.status==='active'))fail('ACTIVE_ROUND');const r=this.seedRound(data,id,input.game);if(r.game==='team21'||r.game==='gift')fail('INVALID_GAME',400);receipt.round=this.publicRound(r);receipt.reason='Hash секрета опубликован';break;}
      case 'start': {const r=this.mine(data,id,input.roundId);if(r.status!=='prepared')fail('ROUND_FINISHED');const amount=this.amount(input.amount);if(typeof input.nonce!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.nonce))fail('INVALID_NONCE',400);if(Object.values(data.rounds).some(x=>x.owner===id&&x.status==='active'))fail('ACTIVE_ROUND');
        if(r.game==='coin'&&(!['heads','tails'].includes(input.choice)||input.numbers!==undefined))fail('INVALID_CHOICE',400);
        if(r.game==='numbers'){if(input.choice&&(!['red','white'].includes(input.choice)||input.numbers))fail('INVALID_CHOICE',400);if(!input.choice&&(!Array.isArray(input.numbers)||input.numbers.length<1||input.numbers.length>12||new Set(input.numbers).size!==input.numbers.length||!input.numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=12)))fail('INVALID_CHOICE',400);}
        if(['multiplier','blackjack'].includes(r.game)&&(input.choice!==undefined||input.numbers!==undefined))fail('INVALID_CHOICE',400);
        r.before=u.balance;r.choice=input.choice;r.numbers=input.numbers;r.nonce=input.nonce;this.hold(data,id,r,amount);r.status='active';r.version++;
        const draw=fair.stream(r.secret,r.id,r.nonce);
        if(r.game==='coin'){r.index=draw(2);r.result=r.index===0?'heads':'tails';this.settle(data,r,r.result===r.choice?r.config.coin.payout:0,r.result==='heads'?'Орёл':'Решка');}
        if(r.game==='numbers'){r.number=draw(12)+1;r.color=r.number%2?'red':'white';const won=r.choice?r.choice===r.color:r.numbers.includes(r.number);const ratio=r.choice?r.config.numbers.colorPayout:Math.floor(r.config.numbers.numberPayout/r.numbers.length);this.settle(data,r,won?ratio:0,'Сектор '+r.number+' · '+(r.color==='red'?'красное':'белое'));r.quotedMultiplier=ratio;}
        if(r.game==='multiplier'){r.draw=draw(10000);let n=r.draw,index=0;while(n>=r.config.multiplier.weights[index])n-=r.config.multiplier.weights[index++];r.index=index;this.settle(data,r,r.config.multiplier.multipliers[index],'Множитель '+r.config.multiplier.multipliers[index]/10000+'×');}
        if(r.game==='blackjack'){this.deal(r,r.nonce);this.natural(data,r);}receipt.round=this.publicRound(r);receipt.reason=r.status==='settled'?'Раунд завершён':'Карты выданы';break;}
      case 'act21': {const r=this.mine(data,id,input.roundId);if(r.game!=='blackjack'||r.status!=='active')fail('ROUND_FINISHED');if(!Number.isInteger(input.version)||input.version!==r.version)fail('VERSION_CONFLICT');this.advance(data,r,input.action,id);receipt.round=this.publicRound(r);receipt.reason=r.status==='settled'?'Раунд завершён':'Ещё карта';break;}
      case 'cancelRound': {const r=this.mine(data,id,input.roundId);if(r.status==='active'&&now<r.expiresAt)fail('ROUND_NOT_EXPIRED');this.cancel(data,r);receipt.reason='Раунд отменён';break;}
      case 'roomCreate': {if(Object.values(data.rooms).some(x=>['waiting','active'].includes(x.status)&&x.members.some(m=>m.user===id)))fail('ACTIVE_ROOM');const r=this.seedRound(data,id,'team21');let code;do{code=crypto.randomBytes(4).toString('hex').toUpperCase();}while(data.rooms[code]);data.rooms[code]={code,owner:id,roundId:r.id,status:'waiting',version:0,members:[{user:id,amount:0,nonce:null,lastSeen:now,online:true}],turn:0,expiresAt:r.expiresAt};receipt.roomCode=code;receipt.reason='Комната создана';break;}
      case 'roomJoin': {if(typeof input.code!=='string'||!/^[-A-Z0-9]{8}$/.test(input.code))fail('INVALID_ROOM',400);const room=data.rooms[input.code];if(!room)fail('ROOM_NOT_FOUND',404);if(room.status!=='waiting')fail('ROOM_STARTED');if(Object.values(data.rooms).some(x=>x.code!==room.code&&['waiting','active'].includes(x.status)&&x.members.some(m=>m.user===id)))fail('ACTIVE_ROOM');let m=room.members.find(m=>m.user===id);if(m?.amount>0)fail('ALREADY_JOINED');if(!m&&room.members.length>=4)fail('ROOM_FULL');if(typeof input.nonce!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.nonce))fail('INVALID_NONCE',400);const amount=this.amount(input.amount),r=data.rounds[room.roundId];this.post(data,id,-amount,amount,'Личный резерв командной 21',r.id);if(!m){m={user:id};room.members.push(m);}Object.assign(m,{amount,nonce:input.nonce,lastSeen:now,online:true});room.version++;receipt.roomCode=room.code;receipt.reason='Ты в команде';break;}
      case 'roomStart': {const room=this.room(data,id,input.code);if(room.owner!==id)fail('ROOM_FORBIDDEN',403);if(room.status!=='waiting')fail('ROOM_STARTED');if(input.version!==room.version)fail('VERSION_CONFLICT');if(room.members.filter(m=>m.amount>0).length<2||room.members.some(m=>!m.amount))fail('ROOM_NOT_READY');const r=data.rounds[room.roundId];r.amount=room.members.reduce((n,m)=>n+m.amount,0);this.deal(r,room.members.map(m=>m.user+':'+m.nonce).join('|'));room.status='active';room.turnEndsAt=now+e.config.games.turnMs;room.version++;this.natural(data,r);receipt.reason='Командный раунд начат';break;}
      case 'roomAct': {const room=this.room(data,id,input.code);if(room.status!=='active')fail('ROUND_FINISHED');if(input.version!==room.version)fail('VERSION_CONFLICT');if(room.members[room.turn]?.user!==id)fail('NOT_YOUR_TURN');if(!['hit','stand'].includes(input.action))fail('INVALID_ACTION',400);const r=data.rounds[room.roundId];this.advance(data,r,input.action,id);room.version++;if(room.status==='active'){const next=room.members.map((m,i)=>m.online?i:-1).filter(i=>i>=0);room.turn=next.find(i=>i>room.turn)??next[0]??room.turn;room.turnEndsAt=now+e.config.games.turnMs;}receipt.reason=room.status==='settled'?'Командный раунд завершён':'Ход сохранён';break;}
      case 'roomLeave': {const room=this.room(data,id,input.code);if(input.version!==room.version)fail('VERSION_CONFLICT');if(!['waiting','active'].includes(room.status))fail('ROUND_FINISHED');const m=room.members.find(m=>m.user===id);if(room.status==='active'){m.online=false;m.lastSeen=now-e.config.games.presenceMs-1;}else if(id===room.owner)this.cancel(data,data.rounds[room.roundId]);else{if(m.amount)this.post(data,id,m.amount,-m.amount,'Возврат резерва при выходе',room.roundId);room.members=room.members.filter(m=>m.user!==id);}room.version++;receipt.reason='Выход из комнаты';break;}
      default:return false;
    }return true;
  }
}
module.exports={Economy,specs,FIXTURES};
