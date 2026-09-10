const https=require('node:https');
const zlib=require('node:zlib');
const LIMIT=5*1024*1024;

function once(url,{method='GET',headers={},body='',timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
    let timer;
    const done=(error,result)=>{clearTimeout(timer);error?reject(error):resolve(result);};
    const req=https.request(url,{method,headers:{...headers,...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>LIMIT)req.destroy(Object.assign(new Error('Response exceeds size limit'),{code:'SIZE_LIMIT'}));
        else chunks.push(chunk);
      });
      res.on('error',error=>done(error));
      res.on('end',()=>{
        try{
          let bytes=Buffer.concat(chunks);
          const encoding=res.headers['content-encoding'];
          if(encoding==='gzip')bytes=zlib.gunzipSync(bytes,{maxOutputLength:LIMIT});
          else if(encoding==='deflate')bytes=zlib.inflateSync(bytes,{maxOutputLength:LIMIT});
          else if(encoding==='br')bytes=zlib.brotliDecompressSync(bytes,{maxOutputLength:LIMIT});
          done(null,{status:res.statusCode,headers:res.headers,text:bytes.toString('utf8')});
        }catch(error){done(Object.assign(new Error('Invalid compressed response'),{code:'BAD_RESPONSE'}));}
      });
    });
    timer=setTimeout(()=>req.destroy(Object.assign(new Error('Request exceeded 20000 ms'),{code:'TIMEOUT'})),timeoutMs);
    req.on('error',error=>done(error));
    req.end(body);
  });
}

async function request(url,options={},transport=once,wait=ms=>new Promise(r=>setTimeout(r,ms))){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await transport(url,options);
      if(response.status<200||response.status>=300){
        const error=new Error(`HTTP ${response.status}`);
        error.retryable=response.status>=500||[408,429].includes(response.status);
        throw error;
      }
      return response;
    }catch(error){
      const retryable=error.retryable??['TIMEOUT','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH'].includes(error.code);
      if(!retryable||attempt===2)throw error;
      await wait(1000);
    }
  }
}
module.exports={request,once};
