// Public timetable reader: no requests to BGTU and no editor credentials.
const headers={'Access-Control-Allow-Origin':'https://crown350.github.io','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(req.method))return reply({ok:false,error:'Метод не поддерживается'},405);
  try{
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res=await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/read_schedule_cache`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error('cache');
    const cache=await res.json();
    if(!cache?.json)throw new Error('empty');
    const stale=Date.now()-Date.parse(cache.fetched_at)>6*3600000;
    return reply({...cache.json,ok:true,cached:true,upstreamRequested:false,fetchedAt:cache.fetched_at,changedAt:cache.changed_at,contentHash:cache.content_hash,sourceMode:'database-snapshot',stale,error:null});
  }catch{return reply({ok:false,error:'Сервис расписания временно недоступен.'},503);}
});
