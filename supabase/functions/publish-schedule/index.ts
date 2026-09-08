import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.0';
const audience='https://piwxslgxwmdrehnomymt.supabase.co/functions/v1/publish-schedule';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return Response.json({ok:false}, {status:405});
  try{
    const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)throw new Error('missing token');
    const {payload}=await jwtVerify(token,jwks,{
      issuer:'https://token.actions.githubusercontent.com',audience,algorithms:['RS256'],
      subject:'repo:Crown350/for-starosta:environment:github-pages',requiredClaims:['exp','iat','ref','workflow_ref','repository'],
    });
    if(payload.repository!=='Crown350/for-starosta'||payload.ref!=='refs/heads/main'
      ||payload.workflow_ref!=='Crown350/for-starosta/.github/workflows/pages.yml@refs/heads/main')throw new Error('wrong workflow');
  }catch{return Response.json({ok:false,error:'Unauthorized workflow'},{status:401});}
  try{
    const body=await req.text();
    if(body.length>200000)return Response.json({ok:false},{status:413});
    const snapshot=JSON.parse(body);
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res=await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/publish_schedule_snapshot`,{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({snapshot}),signal:AbortSignal.timeout(10000),
    });
    if(!res.ok)throw new Error('publish');
    return Response.json(await res.json());
  }catch{return Response.json({ok:false,error:'Snapshot rejected or database unavailable'},{status:500});}
});
