// Accessible in-page forms work on phones and embedded browsers, including PWA.
(()=>{
 const modal=document.createElement('dialog');modal.id='entry-dialog';
 modal.innerHTML='<form method="dialog"><label id="entry-label" for="entry-value"></label><input id="entry-value" autocomplete="off"><div class="row"><button class="btn ghost" type="button" id="entry-cancel">Отмена</button><button class="btn" value="ok">Продолжить</button></div></form>';
 document.body.append(modal);
 document.getElementById('entry-cancel').onclick=()=>modal.close('cancel');
 const style=document.createElement('style');style.textContent='#entry-dialog{width:min(480px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:1px solid var(--stroke-out);border-radius:20px;padding:20px;background:var(--glass-hi);color:var(--ink);backdrop-filter:blur(28px)}#entry-dialog::backdrop{background:rgba(0,0,0,.55)}#entry-label{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:14px}#entry-value{width:100%;padding:12px;border-radius:10px;border:1px solid var(--stroke-out);background:var(--glass-lo);color:var(--ink)}';document.head.append(style);
 const ask=(message,value,confirmOnly)=>new Promise(resolve=>{
  if(modal.open){resolve(confirmOnly?false:null);return;}
  window.modalPending=true;modal.returnValue='cancel';
  const input=document.getElementById('entry-value');document.getElementById('entry-label').textContent=message;
  input.hidden=confirmOnly;input.value=value??'';
  modal.onclose=()=>{window.modalPending=false;resolve(confirmOnly?modal.returnValue==='ok':modal.returnValue==='ok'?input.value:null);};
  modal.showModal();if(!confirmOnly){input.focus();input.select();}
 });
 window.askText=(message,value='')=>ask(message,value,false);
 window.askConfirm=message=>ask(message,'',true);
})();
