'use strict';
const crypto=require('node:crypto'),docs=require('../../club/legal.js');
const hash=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
class Agreements {
  constructor(document=docs){this.document=document;this.hash=hash(document.terms);}
  current(engine,user){const record=engine.data.agreements?.[user]?.terms;return !!record&&record.version===this.document.version&&record.hash===this.hash&&record.age18===true;}
  view(engine,user){const d=this.document;return {required:!this.current(engine,user),consentHash:hash(d.consent),version:d.version,hash:this.hash,effectiveAt:d.effectiveAt,appVersion:d.appVersion,terms:d.terms,summary:d.summary,policy:d.policy,consent:d.consent,rules:d.rules(engine.config),acceptance:engine.data.agreements?.[user]?.terms||null,dataConsent:engine.data.agreements?.[user]?.dataConsent||null};}
  record(engine,user,key,body,kind='terms'){return engine.locked(()=>{
    const bad=code=>{throw Object.assign(Error(code),{code,status:400});};
    if(!body||typeof body!=='object'||Array.isArray(body))bad('INVALID_AGREEMENT');
    const allowed=kind==='terms'?['version','hash','accept','age18']:['version','hash','accept'];
    if(Object.keys(body).some(k=>!allowed.includes(k)))bad('INVALID_AGREEMENT');
    const text=kind==='terms'?this.document.terms:this.document.consent;
    if(body.version!==this.document.version||body.hash!==hash(text))throw Object.assign(Error('TERMS_CHANGED'),{code:'TERMS_CHANGED',status:409});
    if(typeof body.accept!=='boolean'||(kind==='terms'&&(body.accept!==true||body.age18!==true)))bad('AGREEMENT_REQUIRED');
    const data=structuredClone(engine.data);engine.user(data,user);data.agreements??={};const a=data.agreements[user]??={requests:{}};a.requests??={};
    const fingerprint=hash(JSON.stringify({kind,...body})),old=a.requests[key];
    if(old){if(old!==fingerprint)throw Object.assign(Error('KEY_CONFLICT'),{code:'KEY_CONFLICT',status:409});return this.view(engine,user);}
    const record={userId:user,version:this.document.version,hash:hash(text),acceptedAt:engine.now(),appVersion:this.document.appVersion,accepted:body.accept};if(kind==='terms')record.age18=true;
    a[kind==='terms'?'terms':'dataConsent']=record;(a.history??=[]).push({kind,...record});a.requests[key]=fingerprint;
    engine.write(data);engine.data=data;return this.view(engine,user);
  });}
}
module.exports={Agreements,hash};
