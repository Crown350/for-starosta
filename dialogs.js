// Form-based dialogs with labels, inline validation and an error summary.
// Works on phones and embedded browsers, including PWA.
(()=>{
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const modal=document.createElement('dialog');modal.id='entry-dialog';
  modal.innerHTML='<form id="entry-form" novalidate><h2 id="entry-title"></h2>'
    +'<div id="entry-error" class="state-error" role="alert" hidden></div>'
    +'<div id="entry-fields"></div>'
    +'<div class="row dialog-actions"><button class="btn ghost" type="button" id="entry-cancel">Отмена</button><button class="btn" type="submit" id="entry-submit">Сохранить</button></div></form>';
  document.body.append(modal);
  document.getElementById('entry-cancel').onclick=()=>modal.close('cancel');

  const fieldHtml=f=>{
    const id='ef-'+f.name;
    const req=f.required?' <span class="req" aria-hidden="true">*</span>':'';
    const hasLabel=!!f.label;
    const named=hasLabel?'':' aria-labelledby="entry-title"';
    const labelHtml=hasLabel?'<label for="'+id+'">'+esc(f.label)+req+'</label>':'';
    let ctrl;
    if(f.type==='select'){
      ctrl='<select id="'+id+'" name="'+esc(f.name)+'"'
        +(f.required?' aria-required="true"':'')+named+'>'
        +(f.options||[]).map(o=>'<option value="'+esc(o.value)+'"'
          +(String(o.value)===String(f.value??'')?' selected':'')+'>'+esc(o.label)+'</option>').join('')
        +'</select>';
    }else if(f.type==='textarea'){
      ctrl='<textarea id="'+id+'" name="'+esc(f.name)+'"'
        +(f.required?' aria-required="true"':'')+named
        +(f.placeholder?' placeholder="'+esc(f.placeholder)+'"':'')
        +(f.rows?' rows="'+f.rows+'"':'')+'>'+esc(f.value??'')+'</textarea>';
    }else{
      ctrl='<input id="'+id+'" name="'+esc(f.name)+'" type="'+esc(f.type||'text')+'"'
        +(f.value!=null?' value="'+esc(f.value)+'"':'')
        +(f.placeholder?' placeholder="'+esc(f.placeholder)+'"':'')
        +(f.required?' aria-required="true"':'')+named
        +(f.min!=null?' min="'+f.min+'"':'')
        +(f.max!=null?' max="'+f.max+'"':'')
        +(f.maxlength?' maxlength="'+f.maxlength+'"':'')
        +(f.inputmode?' inputmode="'+esc(f.inputmode)+'"':'')
        +(f.autocomplete?' autocomplete="'+esc(f.autocomplete)+'"':'')+'>';
    }
    return '<div class="field">'+labelHtml+ctrl
      +(f.hint?'<p class="hint">'+esc(f.hint)+'</p>':'')
      +'<p class="field-error" hidden></p></div>';
  };

  const messageFor=(f,el)=>{
    const v=String(el.value??'').trim();
    if(f.required&&!v)return 'Заполни это поле';
    if(!v)return '';
    if(f.type==='number'){
      const n=+v.replace(',','.');
      if(!Number.isFinite(n))return 'Нужно число';
      if(f.min!=null&&n<+f.min)return 'Минимум '+f.min;
      if(f.max!=null&&n>+f.max)return 'Максимум '+f.max;
    }
    if(f.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return 'Формат: ГГГГ-ММ-ДД';
    if(f.type==='tel'&&!/^[\d\s()+-]{5,20}$/.test(v))return 'Похоже, это не телефон';
    if(f.maxlength&&v.length>+f.maxlength)return 'Не длиннее '+f.maxlength+' символов';
    return '';
  };

  const collect=fields=>{
    const out={};
    for(const f of fields){
      const el=document.getElementById('ef-'+f.name);
      out[f.name]=el.type==='checkbox'?el.checked:el.value;
    }
    return out;
  };

  window.askForm=({title='',submit='Сохранить',fields=[],error=''})=>new Promise(resolve=>{
    if(modal.open){resolve(null);return;}
    window.modalPending=true;modal.returnValue='cancel';
    document.getElementById('entry-title').textContent=title;
    document.getElementById('entry-submit').textContent=submit;
    const errBox=document.getElementById('entry-error');
    errBox.hidden=!error;errBox.textContent=error;
    const box=document.getElementById('entry-fields');
    box.innerHTML=fields.map(fieldHtml).join('');
    const form=document.getElementById('entry-form');
    modal.onclose=()=>{window.modalPending=false;resolve(modal.returnValue==='ok'?collect(fields):null);};
    form.onsubmit=e=>{
      e.preventDefault();
      let firstBad=null;
      for(const f of fields){
        const el=document.getElementById('ef-'+f.name);
        const msg=messageFor(f,el);
        const fe=el.closest('.field').querySelector('.field-error');
        if(msg){fe.textContent=msg;fe.hidden=false;el.setAttribute('aria-invalid','true');if(!firstBad)firstBad=el;}
        else{fe.hidden=true;el.removeAttribute('aria-invalid');}
      }
      if(firstBad){
        errBox.hidden=false;
        errBox.textContent='Проверь выделенные поля — часть данных не заполнена.';
        firstBad.focus();
        return;
      }
      modal.returnValue='ok';modal.close('ok');
    };
    modal.showModal();
    const first=box.querySelector('input,select,textarea');
    if(first){first.focus();if(first.tagName==='INPUT'&&first.type!=='date'&&first.type!=='number')first.select();}
  });

  window.askText=(message,value='')=>window.askForm({title:message,submit:'Продолжить',fields:[{name:'value',label:'',type:'text',value}]}).then(r=>r===null?null:r.value);
  window.askConfirm=message=>window.askForm({title:message,submit:'Подтвердить',fields:[]}).then(r=>r!==null);
})();
