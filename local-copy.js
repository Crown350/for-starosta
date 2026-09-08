/* Optional device copy. Logout always removes journal data and the preference. */
class JournalLocalCopy {
  constructor(store,key){this.store=store;this.key=key;this.enabled=false;this.pending=Promise.resolve();}
  enqueue(action){this.pending=this.pending.catch(()=>{}).then(action);return this.pending;}
  purge(){return this.enqueue(async()=>{await this.store.remove(this.key);await this.store.remove(this.key+'-cloud-draft');});}
  async init(){this.enabled=(await this.store.get(this.key+'-offline'))==='1';if(!this.enabled)await this.purge();return this.enabled;}
  async setEnabled(enabled){
    this.enabled=enabled;
    await this.enqueue(()=>enabled?this.store.set(this.key+'-offline','1'):this.store.remove(this.key+'-offline'));
    if(!enabled)await this.purge();
  }
  save(snapshot){if(!this.enabled)return Promise.resolve();return this.enqueue(()=>this.store.set(this.key+'-cloud-draft',snapshot));}
  async logout(){this.enabled=false;await this.purge();await this.enqueue(()=>this.store.remove(this.key+'-offline'));}
}
if(typeof module!=='undefined')module.exports=JournalLocalCopy;
