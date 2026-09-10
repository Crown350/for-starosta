const {createHash}=require('node:crypto');
const {request}=require('./http');
const {parseSchedule,parseCurrentWeek,findSelectedGroup,attr}=require('./parser');
const BASE='https://www.tu-bryansk.ru/education/schedule/';
const GROUP='О-26-ИСТ-сии-Б';
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const payload=data=>({ok:true,source:'БГТУ',group:GROUP,currentWeek:data.currentWeek,period:data.period,
  lessons:data.lessons.map(({week,dow,pair,time,subject,kind,teacher,room})=>({week,dow,pair,time,subject,kind,teacher,room}))});

async function fetchSchedule(send=request){
  const cookies=new Map();
  async function bgtu(url,form){
    const headers={'User-Agent':'Starosta-BGTU/10 (+https://www.tu-bryansk.ru/education/schedule/)',Accept:'text/html,application/xhtml+xml',Referer:BASE};
    if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    if(form)Object.assign(headers,{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'});
    const result=await send(url,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form).toString():''});
    for(const cookie of result.headers['set-cookie']||[]){
      const pair=cookie.split(';')[0];const at=pair.indexOf('=');
      if(at>0)cookies.set(pair.slice(0,at),pair.slice(at+1));
    }
    return result.text;
  }
  const page=await bgtu(BASE+'?form='+encodeURIComponent('очная'));
  if(!cookies.has('PHPSESSID'))throw new Error('БГТУ: PHPSESSID не получен');
  const currentWeek=parseCurrentWeek(page);
  const select=page.match(/<select\b[^>]*id=["']period["'][^>]*>([\s\S]*?)<\/select>/i);
  const selected=select?.[1].match(/<option\b([^>]*\bselected[^>]*)>/i);
  const period=selected&&attr(selected[1],'value');
  if(!period||!/^\d{4}-\d{4}_[12]_\d+$/.test(period))throw new Error('БГТУ: учебный период не определён');
  const groups=await bgtu(BASE+'schedule.ajax.php',{namedata:'group',faculty:'Факультет информационных технологий',level:'бакалавр',period,form:'очная'});
  const group=findSelectedGroup(groups,GROUP)||findSelectedGroup(page,GROUP);
  if(!group)throw new Error('БГТУ: группа не найдена');
  const html=await bgtu(BASE+'schedule.ajax.php',{namedata:'schedule',group,period,form:'очная'});
  if(!/class=["'][^"']*contless/i.test(html)||!html.includes('schname'))throw new Error('БГТУ: изменилась разметка');
  const lessons=parseSchedule(html,currentWeek);
  if(lessons.length<10||lessons.length>200||lessons.some(r=>!['odd','even'].includes(r.week)||!Number.isInteger(r.dow)||r.dow<1||r.dow>6||!Number.isInteger(r.pair)||r.pair<1||!r.subject))throw new Error('БГТУ: снимок отклонён, требуется минимум 10 корректных занятий');
  return payload({currentWeek,period,lessons});
}

function output(cache,cached,changed=false,error=null){
  return {...(cache.json||{}),ok:!!cache.json&&!error,lessons:cache.json?.lessons||[],cached,changed,error,
    fetchedAt:cache.fetched_at,changedAt:cache.changed_at,contentHash:cache.content_hash,
    last_attempt_at:cache.last_attempt_at,attemptCount:cache.attempt_count};
}
async function sync({env=process.env,send=request,now=()=>new Date().toISOString(),origin='http',triggerId=null}={}){
  const url=env.SUPABASE_URL;
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)||!key||key.startsWith('sb_publishable_'))throw new Error('Задайте SUPABASE_URL и серверный SUPABASE_SERVICE_ROLE_KEY');
  async function rpc(name,body){
    const headers={apikey:key,'Content-Type':'application/json'};
    if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
    const response=await send(url.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});
    return JSON.parse(response.text);
  }
  const claim=await rpc('claim_yandex_schedule',{origin,trigger_id:triggerId});
  if(!claim.acquired)return output(claim.cache,true);
  try{
    const snapshot=await fetchSchedule(send);
    snapshot.fetchedAt=now();
    const comparedChanged=!claim.cache.json||hash(payload(claim.cache.json))!==hash(payload(snapshot));
    const saved=await rpc('finish_yandex_schedule',{lease:claim.cache.request_token,snapshot});
    return {...output(saved.cache,!!saved.superseded,saved.changed),comparedChanged};
  }catch(error){
    const message=`Не удалось обновить БГТУ: ${error.code||error.message}`;
    try{
      const saved=await rpc('finish_yandex_schedule',{lease:claim.cache.request_token,failure:message});
      return output(saved.cache,false,false,message);
    }catch{return output(claim.cache,false,false,message);}
  }
}
const cors={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'https://crown350.github.io','Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':'content-type'};
const reply=(body,statusCode=200)=>({statusCode,headers:cors,isBase64Encoded:false,body:JSON.stringify(body)});
exports.handler=async(event={},context={})=>{
  const method=event.httpMethod;
  if(method==='OPTIONS')return reply({},204);
  if(method&&!['GET','POST'].includes(method))return reply({ok:false,error:'Метод не поддерживается'},405);
  const metadata=!method&&event.messages?.[0]?.event_metadata;
  const timer=metadata?.event_type==='yandex.cloud.events.serverless.triggers.TimerMessage';
  const origin=timer?'timer':'http';
  try{
    const result=await sync({origin,triggerId:timer?metadata.trigger_id:null});
    console.log(JSON.stringify({origin,triggerId:metadata?.trigger_id||null,requestId:context.requestId,
      ok:result.ok,cached:result.cached,changed:result.changed,lessons:result.lessons.length,last_attempt_at:result.last_attempt_at,fetchedAt:result.fetchedAt}));
    if(result.error){console.error(result.error);if(timer)throw new Error(result.error);}
    return reply(result,result.ok?200:502);
  }catch(error){
    const message=`bgtu-sync: ${error.code||error.message}`;console.error(message);
    if(timer)throw new Error(message);
    return reply({ok:false,error:'Сервис расписания временно недоступен.'},502);
  }
};
exports.sync=sync;
exports.fetchSchedule=fetchSchedule;
exports.hash=hash;
