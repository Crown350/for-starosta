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
   const timeout=AbortSignal.timeout(6000);
   const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
   const url=proxy?root+'?path='+encodeURIComponent(path):root+path;
   return fetch(url,{...options,headers,signal,cache:'no-store'});
  }
  try{return await attempt(base,throughProxy);}
  catch(error){
   if(options.signal?.aborted)throw error;
   if(throughProxy){
    try{return await attempt(fallback,false);}
    catch(fallbackError){if(options.signal?.aborted)throw fallbackError;}
   }
   throw new Error('Нет соединения с журналом. Попробуйте VPN и повторите запрос.');
  }
 };
})();
