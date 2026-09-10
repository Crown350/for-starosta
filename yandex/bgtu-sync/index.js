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

async function sync({env=process.env,send=request,now=()=>new Date().toISOString()}={}){
  const url=env.SUPABASE_URL;
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)||!key||key.startsWith('sb_publishable_'))throw new Error('Задайте SUPABASE_URL и серверный SUPABASE_SERVICE_ROLE_KEY');
  const snapshot=await fetchSchedule(send);
  snapshot.fetchedAt=now();
  async function rpc(name,body){
    const headers={apikey:key,'Content-Type':'application/json'};
    // New sb_secret keys belong in apikey; legacy service_role is also a JWT.
    if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
    const response=await send(url.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});
    return JSON.parse(response.text);
  }
  const previous=await rpc('read_schedule_cache',{});
  const contentHash=hash(payload(snapshot));
  const comparedChanged=!previous?.json||hash(payload(previous.json))!==contentHash;
  // The database atomically checks its own hash and prevents older runs overwriting newer ones.
  // Unchanged JSON/changed_at stay intact; only fetched_at advances after a successful check.
  const saved=await rpc('publish_schedule_snapshot',{snapshot});
  if(!saved.ok)throw new Error('Supabase: снимок не принят');
  return {ok:true,lessons:snapshot.lessons.length,changed:saved.changed,comparedChanged,ignored:!!saved.ignored,
    fetchedAt:saved.fetchedAt||previous?.fetched_at,contentHash};
}
exports.handler=async()=>{
  try{
    const result=await sync();console.log(JSON.stringify(result));
    return {statusCode:200,headers:{'Content-Type':'application/json'},isBase64Encoded:false,body:JSON.stringify(result)};
  }catch(error){
    // Never print request headers, environment values, response bodies or credentials.
    const message=`bgtu-sync: ${error.code||error.message}`;
    console.error(message);throw new Error(message);
  }
};
exports.sync=sync;
exports.fetchSchedule=fetchSchedule;
exports.hash=hash;
