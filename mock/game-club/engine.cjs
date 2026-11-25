'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {config,validate,categories}=require('./config.cjs');
const {Economy,specs,FIXTURES}=require('./economy.cjs');
const fair=require('./fairness.cjs');
class ClubError extends Error{constructor(code,status=409){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new ClubError(code,status);};
function selectReward(rewards,draw){
  if(!Number.isInteger(draw)||draw<0||draw>=10000)throw Error('Invalid draw');
  let end=0;for(const r of rewards){end+=r.weight;if(draw<end)return r;}throw Error('Invalid weights');
}
class Engine{
  constructor({file,now=Date.now,draw,economy=config,write,initialState,profiles=null,limits,secretFactory=()=>crypto.randomBytes(32).toString('hex')}={}){
    this.config=structuredClone(validate(economy));this.file=file;this.now=now;this.draw=draw;this.secretFactory=secretFactory;this.queue=Promise.resolve();this.limits=limits||new Map();this.profiles=profiles;
    this.data=initialState!==undefined?structuredClone(initialState):
      file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,users:{},events:{}};
    if(this.data.version!==1)throw Error('Unsupported state');
    this.write=write||((data)=>{if(!file)return;fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);});
    this.economy=new Economy(this);this.economy.init(this.data);this.economy.check(this.data);
  }
  locked(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{});return task;}
  profile(data,id){
    if(this.profiles){
      if(Object.hasOwn(data.users,id))return data.users[id];
      return this.profiles.get(id);
    }
    return Object.hasOwn(FIXTURES,id)?{name:FIXTURES[id],createdAt:this.now()-8*86400000}:undefined;
  }
  user(data,id){
    const profile=this.profile(data,id);
    if(!profile)fail('UNAUTHORIZED',401);
    return data.users[id]||(data.users[id]={
      name:profile.name,createdAt:profile.createdAt,reserved:0,welcome:false,balance:0,
      tickets:0,lastTicket:null,streak:0,misses:0,owned:[],equipped:{},history:[],
      operations:{},predictions:{}
    });
  }
  event(data,time){const slot=Math.floor(time/this.config.predictionDurationMs),id='garden-'+slot;if(!data.events[id])data.events[id]={id,title:'Какой фонарь зажжётся в воображаемом саду?',options:['Янтарный','Сиреневый'],closesAt:(slot+1)*this.config.predictionDurationMs,result:crypto.randomInt(2)};return data.events[id];}
  snapshot(data,id){const u=this.user(data,id),time=this.now(),e=this.event(data,time);const events=Object.values(data.events).filter(e=>e.id===this.event(data,time).id||u.predictions[e.id]).map(e=>({...e,result:time>=e.closesAt?e.result:null,selection:u.predictions[e.id]?.choice??null,claimed:!!u.predictions[e.id]?.claimed}));
    const rare=this.config.rewards.filter(r=>r.rare),guaranteed=u.misses>=this.config.pity-1;
    if(!u.giftRound||data.rounds[u.giftRound]?.status!=='prepared')u.giftRound=this.economy.seedRound(data,id,'gift').id;
    const rooms=Object.values(data.rooms).filter(r=>r.members.some(m=>m.user===id)).map(r=>({...r,members:r.members.map(m=>({...m,name:this.user(data,m.user).name})),round:this.economy.publicRound(data.rounds[r.roundId])}));
    return {account:id,name:u.name,createdAt:u.createdAt,mock:!this.profiles,balance:u.balance,reserved:u.reserved,welcome:u.welcome,transfers:{...this.config.transfers,used:this.economy.limits(data,id)},games:this.config.games,rounds:Object.values(data.rounds).filter(r=>r.owner===id&&r.game!=='team21').slice(-30).map(r=>this.economy.publicRound(r)),rooms,ledger:data.ledger.filter(l=>l.account===id).slice(-100).reverse(),giftRound:this.economy.publicRound(data.rounds[u.giftRound]),tickets:u.tickets,streak:u.streak,misses:u.misses,pity:this.config.pity,serverTime:time,nextTicketAt:u.lastTicket===null?time:u.lastTicket+this.config.ticketIntervalMs,owned:u.owned,equipped:u.equipped,history:u.history.slice(-50).reverse(),catalogue:this.config.catalogue,events,probabilities:this.config.rewards.map(r=>({...r,probability:guaranteed?(r.rare?r.weight/rare.reduce((n,r)=>n+r.weight,0):0):r.weight/10000})),guaranteed};
  }
  state(id){return this.locked(()=>{const data=structuredClone(this.data);this.user(data,id);for(const room of Object.values(data.rooms))if(['waiting','active'].includes(room.status)){const m=room.members.find(m=>m.user===id);if(m){m.online=true;m.lastSeen=this.now();}}this.economy.sweep(data);const result=this.snapshot(data,id);this.economy.check(data);this.write(data);this.data=data;return result;});}
  tick(){return this.locked(()=>{const data=structuredClone(this.data);if(this.economy.sweep(data)){this.economy.check(data);this.write(data);this.data=data;}});}
  search(id,query){return this.locked(()=>{this.user(this.data,id);if(typeof query!=='string'||query.length<1||query.length>80)fail('INVALID_QUERY',400);const q=query.toLocaleLowerCase('ru-RU');return Object.entries(this.data.users).filter(([uid,u])=>uid===query||u.name.toLocaleLowerCase('ru-RU').includes(q)).map(([uid,u])=>({id:uid,name:u.name}));});}
  command(id,key,input){return this.locked(()=>{
    if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(key))fail('INVALID_KEY',400);
    if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_COMMAND',400);
    const allowed={ticket:[],spin:[],buy:['itemId'],equip:['itemId'],unequip:['category'],predict:['eventId','choice'],claim:['eventId'],...specs};
    if(typeof input.type!=='string'||!Object.hasOwn(allowed,input.type)||Object.keys(input).some(k=>k!=='type'&&!allowed[input.type].includes(k)))fail('INVALID_COMMAND',400);
    if(['buy','equip'].includes(input.type)&&(typeof input.itemId!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(input.itemId)))fail('INVALID_COMMAND',400);
    if(['predict','claim'].includes(input.type)&&(typeof input.eventId!=='string'||!/^garden-\d{1,12}$/.test(input.eventId)))fail('INVALID_COMMAND',400);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify(Object.keys(input).sort().map(k=>[k,input[k]]))).digest('hex');
    const data=structuredClone(this.data),u=this.user(data,id),old=u.operations[key];
    if(old){if(old.fingerprint!==fingerprint)fail('KEY_CONFLICT');return {receipt:old.receipt,state:this.snapshot(data,id),replayed:true};}
    const time=this.now(),recent=(this.limits.get(id)||[]).filter(t=>t>time-60000);if(recent.length>=30)fail('RATE_LIMIT',429);this.limits.set(id,[...recent,time]);
    this.economy.sweep(data);const before=u.balance;
    const receipt={id:crypto.randomUUID(),type:input.type,at:time,delta:0,reason:''};
    const change=(delta,reason)=>{this.economy.post(data,id,delta,0,reason);receipt.delta=delta;receipt.reason=reason;};
    switch(input.type){
      case 'ticket': if(u.lastTicket!==null&&time<u.lastTicket+this.config.ticketIntervalMs)fail('TICKET_NOT_READY');u.streak=u.lastTicket!==null&&time-u.lastTicket<2*this.config.ticketIntervalMs?u.streak+1:1;u.lastTicket=time;u.tickets++;receipt.reason='Бесплатный билет за вход';break;
      case 'spin': {if(u.tickets<1)fail('NO_TICKET');if(!u.giftRound||data.rounds[u.giftRound]?.status!=='prepared')u.giftRound=this.economy.seedRound(data,id,'gift').id;const round=data.rounds[u.giftRound];round.nonce=key;round.draw=this.draw?this.draw():fair.stream(round.secret,round.id,key)(10000);let r=selectReward(this.config.rewards,round.draw);if(u.misses>=this.config.pity-1){const rare=this.config.rewards.filter(r=>r.rare);const total=rare.reduce((n,r)=>n+r.weight,0);let n=Math.floor(round.draw*total/10000);r=rare.find(r=>(n-=r.weight)<0);}round.status='settled';round.finishedAt=time;round.reward=r;receipt.round=this.economy.publicRound(round);u.tickets--;u.misses=r.rare?0:u.misses+1;receipt.reward=r;change(r.sparks,'Награда: '+r.label);if(r.itemId&&!u.owned.includes(r.itemId))u.owned.push(r.itemId);break;}
      case 'buy': {const i=this.config.catalogue.find(i=>i.id===input.itemId);if(!i)fail('UNKNOWN_ITEM',400);if(u.owned.includes(i.id))fail('ALREADY_OWNED');change(-i.price,'Косметика: '+i.name);u.owned.push(i.id);break;}
      case 'equip': {const i=this.config.catalogue.find(i=>i.id===input.itemId);if(!i||!u.owned.includes(i.id))fail('NOT_OWNED');u.equipped[i.category]=i.id;receipt.reason='Применено: '+i.name;break;}
      case 'unequip': if(!categories.includes(input.category))fail('INVALID_CATEGORY',400);delete u.equipped[input.category];receipt.reason='Оформление снято';break;
      case 'predict': {const e=this.event(data,time);if(e.id!==input.eventId||time>=e.closesAt)fail('EVENT_CLOSED');if(![0,1].includes(input.choice))fail('INVALID_CHOICE',400);if(u.predictions[e.id])fail('ALREADY_PREDICTED');u.predictions[e.id]={choice:input.choice,claimed:false};receipt.reason='Бесплатный прогноз сохранён';break;}
      case 'claim': {const e=data.events[input.eventId],p=u.predictions[input.eventId];if(!e||!p)fail('NO_PREDICTION');if(time<e.closesAt)fail('EVENT_OPEN');if(p.claimed)fail('ALREADY_CLAIMED');p.claimed=true;change(p.choice===e.result?25:10,'Награда за вымышленный прогноз');break;}
      default: this.economy.command(data,id,input,receipt);receipt.delta=u.balance-before;
    }
    u.history.push(receipt);u.operations[key]={fingerprint,receipt};const state=this.snapshot(data,id);this.economy.check(data);this.write(data);this.data=data;return {receipt,state,replayed:false};
  });}
}
module.exports={Engine,ClubError,selectReward};
