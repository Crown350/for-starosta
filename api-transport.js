/* One transport for journal RPC and schedule reads. No credentials are stored here. */
(()=>{
 window.starostaSupabaseFetch=async(path,options={})=>{
  if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Некорректный путь API');
  const base=window.STAROSTA_SUPABASE_URL.replace(/\/$/,'');
  const fallback=(window.STAROSTA_SUPABASE_FALLBACK_URL||'').replace(/\/$/,'');
  const throughProxy=!!fallback&&base!==fallback;
  async function attempt(root,proxy){
   const headers=new Headers(options.headers||{});
   if(proxy&&headers.has('Authorization')){headers.set('X-Supabase-Authorization',headers.get('Authorization'));headers.delete('Authorization');}
   const timeout=AbortSignal.timeout(22000);
   const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
   const url=proxy?root+'?path='+encodeURIComponent(path):root+path;
   return fetch(url,{...options,headers,signal,cache:'no-store'});
  }
  let response;
  try{response=await attempt(base,throughProxy);}
  catch(error){if(!throughProxy||options.signal?.aborted)throw error;return attempt(fallback,false);}
  // Supabase auth/conflict/rate-limit responses are authoritative; never bypass them.
  if(throughProxy&&(response.status>=500||(!response.ok&&!response.headers.get('x-starosta-proxy')))){
   return attempt(fallback,false);
  }
  return response;
 };
})();
