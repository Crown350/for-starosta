/* ============================ ХРАНИЛИЩЕ ============================ */
const APP_V = 11;
const KEY = 'starosta-o26-ist-sii-b';
const store = {
  async get(k){
    if (window.storage) { try { const r = await window.storage.get(k); return r && r.value; } catch(e){} }
    try { return localStorage.getItem(k); } catch(e){ return null; }
  },
  async set(k,v){
    if (window.storage) { try { await window.storage.set(k,v); return; } catch(e){} }
    try { localStorage.setItem(k,v); } catch(e){ toast('Память заполнена'); }
  },
  async remove(k){
    if(window.storage && typeof window.storage.delete==='function')await window.storage.delete(k);
    localStorage.removeItem(k);
  }
};

/* ============================ НАЧАЛЬНЫЕ ДАННЫЕ ============================ */
const NAMES = [];  // список группы заводится на телефоне, в коде его нет
const SUBJ = ["Языки программирования","Дискретная математика","Математический анализ",
  "Алгебра и геометрия","Информатика","Основы системного анализа"];
const KINDS = ["лекция","практика","лаба","семинар"];
const DOW = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];

function fresh(){
  return {
    v:1,
    group:'О-26-ИСТ-СИИ-Б',
    students: NAMES.map((n,i)=>({id:'s'+i, fio:n, phone:'', tg:'', note:''})),
    teachers: [],
    subjects: SUBJ.map((n,i)=>({id:'p'+i, name:n, control:'', teacherId:''})),
    lessons: [],          // {id,date,pair,subjectId,kind,teacherId,room}
    att: {},              // att[lessonId][studentId] = 'n' | 'u'
    works: [],            // {id,subjectId,name,due}
    subs: {},             // subs[workId][studentId] = {s,mark,note}
    funds: [],            // {id,name,per}
    pays: {},             // pays[fundId][studentId] = число
    tpl: [],              // {id,dow,pair,subjectId,kind,room}
    duty: {idx:0, log:[]},// log: {date, studentId}
    schedule: {
      source:'БГТУ', year:'2026-2027', semester:1, form:'Очное',
      faculty:'Факультет информационных технологий', education:'бакалавр',
      code:'09.03.02', profile:'Системы искусственного интеллекта и обработка больших данных',
      group:'О-26-ИСТ-СИИ-Б', week:'odd', importedAt:''
    },
    limit: 3              // порог пропусков
  };
}
let S = fresh();
let tab = 'pairs', view = null, ctx = {};
let curDate = todayISO();

/* ============================ УТИЛИТЫ ============================ */
const $ = id => document.getElementById(id);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function todayISO(){ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); }
function fmtDate(iso){ const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }
function dowOf(iso){ return new Date(iso+'T12:00:00').getDay(); }
function subjName(id){ const s=S.subjects.find(x=>x.id===id); return s?s.name:'без предмета'; }
function teachName(id){ const t=S.teachers.find(x=>x.id===id); return t?t.fio:''; }
function stud(id){ return S.students.find(x=>x.id===id); }
function plural(n,a,b,c){const m=Math.abs(n)%100,k=m%10;
  return n+' '+(m>10&&m<20?c:k>1&&k<5?b:k===1?a:c);}
function surname(fio){ return String(fio).trim().split(/\s+/)[0]||''; }
function initials(fio){ const p=String(fio).trim().split(/\s+/); return p[0]+(p[1]?' '+p[1][0]+'.':'')+(p[2]?p[2][0]+'.':''); }
function norm(s){ return String(s).toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я]/g,''); }
function lev(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  let prev=Array.from({length:n+1},(_,i)=>i), cur=new Array(n+1);
  for(let i=1;i<=m;i++){ cur[0]=i;
    for(let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    [prev,cur]=[cur,prev];
  }
  return prev[n];
}
function matchStudent(fio){
  const q = norm(surname(fio));
  if(!q) return null;
  let exact = S.students.find(s=>norm(surname(s.fio))===q);
  if(exact) return exact;
  let best=null, bd=99;
  S.students.forEach(s=>{ const d=lev(q,norm(surname(s.fio))); if(d<bd){bd=d;best=s;} });
  return bd<=2 ? best : null;
}
let _t;
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.add('show');
  clearTimeout(_t); _t=setTimeout(()=>t.classList.remove('show'),1800); }
let _sv;
function save(){ if(window.cloudSave) window.cloudSave(); else {clearTimeout(_sv); _sv=setTimeout(()=>store.set(KEY, JSON.stringify(S)),120);} }
function copy(txt, msg){
  const ok=()=>toast(msg||'Скопировано');
  if(navigator.clipboard) navigator.clipboard.writeText(txt).then(ok,()=>askText('Скопируй вручную:',txt));
  else askText('Скопируй вручную:',txt);
}

/* ============================ ПОДСЧЁТЫ ============================ */
function lessonsOn(date){ return S.lessons.filter(l=>l.date===date).sort((a,b)=>a.pair-b.pair); }
function attOf(lid){ S.att[lid]=S.att[lid]||{}; return S.att[lid]; }
function subsOf(wid){ S.subs[wid]=S.subs[wid]||{}; return S.subs[wid]; }
function paysOf(fid){ S.pays[fid]=S.pays[fid]||{}; return S.pays[fid]; }
function missCount(sid, subjectId){
  let n=0,u=0;
  S.lessons.forEach(l=>{
    if(subjectId && l.subjectId!==subjectId) return;
    const v=(S.att[l.id]||{})[sid];
    if(v==='n') n++; else if(v==='u') u++;
  });
  return {n,u};
}
function debtWorks(sid){
  return S.works.filter(w=>{ const c=(S.subs[w.id]||{})[sid]; return !c || c.s!=='y'; });
}
function fundDebt(sid){
  let d=0;
  S.funds.forEach(f=>{ const p=(S.pays[f.id]||{})[sid]||0; if(p < (f.per||0)) d += (f.per||0)-p; });
  return d;
}

/* ============================ РЕНДЕР ============================ */
let curriculum=[];
function render(){
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.tab===tab));
  const app=$('app');
  if(view==='att') return app.innerHTML = viewAtt();
  if(view==='work') return app.innerHTML = viewWork();
  if(view==='fund') return app.innerHTML = viewFund();
  if(view==='student') return app.innerHTML = viewStudent();
  if(view==='import') return app.innerHTML = viewImport();
  if(view==='dir') return app.innerHTML = viewDir();
  if(view==='tpl') return app.innerHTML = viewTpl();
  if(view==='bgtu') return app.innerHTML = viewBGTU();
  if(tab==='pairs') app.innerHTML = viewPairs();
  if(tab==='works') app.innerHTML = viewWorks();
  if(tab==='money') app.innerHTML = viewMoney();
  if(tab==='group') app.innerHTML = viewGroup();
  if(tab==='semester') app.innerHTML=viewSemester();
  if(tab==='more')  app.innerHTML = viewMore();
}
function head(title, sub, backTo){
  return `<header>
    ${backTo!==undefined?`<button class="back" data-act="back">‹ назад</button>`:`<div class="grp">${esc(S.group)}</div>`}
    <div class="htitle">${esc(title)}</div>
    ${sub?`<div class="grp">${sub}</div>`:''}`;
}

/* ---------- ПАРЫ ---------- */
function viewPairs(){
  ensureBGTULessonsForDate(curDate);
  const ls = lessonsOn(curDate);
  const d = dowOf(curDate);
  let h = head('Пары', `${DOW[d]} · БГТУ: ${bgtuWeekLabel(bgtuCurrentWeekForDate(curDate))} неделя`) + `
    <div class="row date-row">
      <button class="iconbtn" data-act="dshift" data-v="-1">‹</button>
      <input type="date" id="curDate" value="${curDate}">
      <button class="iconbtn" data-act="dshift" data-v="1">›</button>
      <button class="iconbtn" data-act="today">сегодня</button>
    </div></header>`;

  if(S.schedule?.lastError)h+=`<p class="card" role="alert">${esc(S.schedule.lastError)}</p>`;
  h += `<ul>`;
  if(!ls.length){
    h += `<div class="empty">На этот день пар нет.<br>Выбери другую дату или проверь расписание в разделе «Ещё».</div>`;
  }
  ls.forEach(l=>{
    const a = S.att[l.id]||{};
    let n=0,u=0; Object.values(a).forEach(v=>{ if(v==='n')n++; else if(v==='u')u++; });
    const was = S.students.length-n-u;
    h += `<li class="card">
      <div class="lesson" data-act="openatt" data-id="${l.id}">
        <span class="pairno">${l.pair}</span>
        <span class="t"><b>${esc(subjName(l.subjectId))}</b>
          <span>${l.time?esc(l.time)+' · ':''}${esc(l.kind||'')}${l.room?' · '+esc(l.room):''}${l.teacherId?' · '+esc(initials(teachName(l.teacherId))):''}</span></span>
        <span class="chip ${n?'bad':'ok'}">${n} Н</span>
        ${u?`<span class="chip warn">${u} У</span>`:''}
      </div>
      <div class="row">
        <button class="btn ghost" data-act="openatt" data-id="${l.id}" style="flex:1">${window.cloudCanEdit?.()?`Отметить (был${was===S.students.length?'и все':'о '+was})`:'Посмотреть пару'}</button>
        <button class="iconbtn" data-act="editlesson" data-id="${l.id}">✎</button>
        <button class="iconbtn" data-act="dellesson" data-id="${l.id}">🗑</button>
      </div>
    </li>`;
  });
  h += `</ul>
    <div class="row wrap-it">
      <button class="btn ghost" data-act="addlesson" style="flex:1">+ Пара</button>
      <button class="btn ghost" data-act="fromtpl" style="flex:1">Из шаблона недели</button>
    </div>
    <div class="row"><button class="btn wide" data-act="daysum">Отчёт за день в буфер</button></div>`;
  return h;
}
function viewAtt(){
  const l = S.lessons.find(x=>x.id===ctx.lesson);
  if(!l){ view=null; return viewPairs(); }
  const a = attOf(l.id);
  let n=0,u=0; Object.values(a).forEach(v=>{ if(v==='n')n++; else if(v==='u')u++; });
  const tot=S.students.length||1, was=S.students.length-n-u;
  let h = head(subjName(l.subjectId), `${fmtDate(l.date)} · ${l.pair} пара · ${esc(l.kind||'')}${l.room?' · ауд. '+esc(l.room):''} <button class="back" data-act="editlesson" data-id="${l.id}">изменить</button>`, 1) + `
    <div class="bar">
      <div class="bartrack">
        <div class="barfill" style="width:${was/tot*100}%"></div>
        <div class="barfill warn" style="width:${u/tot*100}%"></div>
        <div class="barfill bad" style="width:${n/tot*100}%"></div>
      </div>
      <div class="stats"><span>Были <b>${was}</b></span><span>Н <b>${n}</b></span><span>У <b>${u}</b></span></div>
    </div></header>
    <p class="hint">По умолчанию все на паре. Отмечай только тех, кого нет: Н — прогул, У — по уважительной.</p><ul>`;
  S.students.forEach((s,i)=>{
    const v = a[s.id];
    h += `<li class="card ${v==='n'?'no':v==='u'?'exc':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}</span>
        <span class="marks">
          <button class="mark n" data-act="mark" data-v="n" aria-pressed="${v==='n'}">Н</button>
          <button class="mark u" data-act="mark" data-v="u" aria-pressed="${v==='u'}">У</button>
        </span>
      </div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost" data-act="clearatt" style="flex:1">Снять отметки</button>
      <button class="btn" data-act="attreport" style="flex:1">Отчёт в буфер</button>
    </div>`;
  return h;
}

/* ---------- СДАЧИ ---------- */
function viewWorks(){
  let h = head('Сдачи и дедлайны') + `</header>`;
  if(!S.works.length) h += `<div class="empty">Работ пока нет.<br>Добавь лабу, РГР или контрольную — и отмечай, кто сдал.</div>`;
  const today = todayISO();
  const sorted = S.works.slice().sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1);
  h += `<ul>`;
  sorted.forEach(w=>{
    const m = S.subs[w.id]||{};
    let y=0; S.students.forEach(s=>{ if((m[s.id]||{}).s==='y') y++; });
    const late = w.due && w.due < today;
    h += `<li class="card">
      <div class="lesson" data-act="openwork" data-id="${w.id}">
        <span class="t"><b>${esc(w.name)}</b><span>${esc(subjName(w.subjectId))}${w.due?' · до '+fmtDate(w.due):''}</span></span>
        <span class="chip ${y===S.students.length?'ok':late?'bad':''}">${y}/${S.students.length}</span>
      </div>
      <div class="bar"><div class="bartrack"><div class="barfill" style="width:${y/(S.students.length||1)*100}%"></div></div></div>
    </li>`;
  });
  h += `</ul><div class="row"><button class="btn wide" data-act="addwork">+ Работа</button></div>`;
  return h;
}
function viewWork(){
  const w = S.works.find(x=>x.id===ctx.work);
  if(!w){ view=null; return viewWorks(); }
  const m = subsOf(w.id);
  let y=0,n=0; S.students.forEach(s=>{ const v=(m[s.id]||{}).s; if(v==='y')y++; else if(v==='n')n++; });
  const tot=S.students.length||1;
  let h = head(w.name, `${esc(subjName(w.subjectId))}${w.due?' · дедлайн '+fmtDate(w.due):''}`, 1) + `
    <div class="bar">
      <div class="bartrack"><div class="barfill" style="width:${y/tot*100}%"></div>
      <div class="barfill bad" style="width:${n/tot*100}%"></div></div>
      <div class="stats"><span>Сдали <b>${y}</b></span><span>Не сдали <b>${n}</b></span><span>Без отметки <b>${tot-y-n}</b></span></div>
    </div>
    <div class="row"><input type="text" id="q" placeholder="Поиск по фамилии" value="${esc(ctx.q||'')}"></div>
    </header><ul>`;
  const q = norm(ctx.q||'');
  S.students.forEach((s,i)=>{
    if(q && !norm(s.fio).includes(q)) return;
    const c = m[s.id]||{s:null,mark:'',note:''};
    h += `<li class="card ${c.s==='y'?'yes':c.s==='n'?'no':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}${c.note||c.mark?`<small>${esc([c.mark,c.note].filter(Boolean).join(' · '))}</small>`:''}</span>
        <span class="marks">
          <button class="mark y" data-act="smark" data-v="y" aria-pressed="${c.s==='y'}">✓</button>
          <button class="mark n" data-act="smark" data-v="n" aria-pressed="${c.s==='n'}">✕</button>
        </span>
      </div>
      <button class="notebtn" data-act="opennote">${c.note||c.mark?'изменить оценку / заметку':'оценка / заметка'}</button>
      <div class="noteline"><input type="text" data-act="note" value="${esc([c.mark,c.note].filter(Boolean).join(' · '))}"
        placeholder="оценка, дата, комментарий"></div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost" data-act="delwork" style="flex:1">Удалить работу</button>
      <button class="btn" data-act="workreport" style="flex:1">Отчёт в буфер</button>
    </div>`;
  return h;
}

/* ---------- ДЕНЬГИ ---------- */
function viewMoney(){
  let h = head('Сборы') + `</header>`;
  if(!S.funds.length) h += `<div class="empty">Сборов нет.<br>Создай сбор — например, на ремонт кабинета — и отмечай, кто скинулся.</div>`;
  h += `<ul>`;
  S.funds.forEach(f=>{
    const p = S.pays[f.id]||{};
    let got=0, cnt=0;
    S.students.forEach(s=>{ const v=p[s.id]||0; got+=v; if(v>=(f.per||0) && (f.per||0)>0) cnt++; });
    const goal = (f.per||0)*S.students.length;
    h += `<li class="card">
      <div class="lesson" data-act="openfund" data-id="${f.id}">
        <span class="t"><b>${esc(f.name)}</b><span>по ${f.per||0} ₽ с человека</span></span>
        <span class="chip ${cnt===S.students.length?'ok':''}">${cnt}/${S.students.length}</span>
      </div>
      <div class="bar"><div class="bartrack"><div class="barfill" style="width:${goal?Math.min(100,got/goal*100):0}%"></div></div>
      <div class="stats"><span>Собрано <b>${got}</b> из <b>${goal}</b> ₽</span></div></div>
    </li>`;
  });
  h += `</ul><div class="row"><button class="btn wide" data-act="addfund">+ Сбор</button></div>`;
  return h;
}
function viewFund(){
  const f = S.funds.find(x=>x.id===ctx.fund);
  if(!f){ view=null; return viewMoney(); }
  const p = paysOf(f.id);
  let got=0,cnt=0;
  S.students.forEach(s=>{ const v=p[s.id]||0; got+=v; if(v>=(f.per||0)&&(f.per||0)>0) cnt++; });
  const goal=(f.per||0)*S.students.length;
  let h = head(f.name, `по ${f.per||0} ₽ · собрано ${got} из ${goal} ₽`, 1) + `
    <div class="bar"><div class="bartrack"><div class="barfill" style="width:${goal?Math.min(100,got/goal*100):0}%"></div></div>
    <div class="stats"><span>Сдали <b>${cnt}</b></span><span>Осталось <b>${S.students.length-cnt}</b></span></div></div>
    </header><p class="hint">Тап по кнопке — сдал полностью. Долго держать не нужно: частичную сумму впиши в поле.</p><ul>`;
  S.students.forEach((s,i)=>{
    const v = p[s.id]||0;
    const full = (f.per||0)>0 && v>=(f.per||0);
    h += `<li class="card ${full?'yes':v>0?'exc':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}${v&&!full?`<small>частично: ${v} ₽</small>`:''}</span>
        <span class="marks">
          <button class="mark y" data-act="pay" aria-pressed="${full}">₽</button>
        </span>
      </div>
      <button class="notebtn" data-act="opennote">${v?'изменить сумму':'частичная сумма'}</button>
      <div class="noteline"><input type="number" inputmode="numeric" data-act="paysum" value="${v||''}" placeholder="сколько сдал"></div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost" data-act="delfund" style="flex:1">Удалить сбор</button>
      <button class="btn" data-act="fundreport" style="flex:1">Кто должен — в буфер</button>
    </div>`;
  return h;
}

/* ---------- ГРУППА ---------- */
function viewGroup(){
  const order = S.students;
  const dutyNow = order.length ? order[S.duty.idx % order.length] : null;
  let h = head('Группа', plural(S.students.length,'человек','человека','человек')) + `
    <div class="row"><input type="text" id="gq" placeholder="Поиск по фамилии" value="${esc(ctx.gq||'')}"></div>
    </header>
    ${!S.students.length?`<div class="empty">Группы пока нет.<br>Отсканируй список в разделе «Ещё» или добавь людей вручную.</div>`:''}
    <div class="card" ${!S.students.length?'hidden':''}>
      <div class="top"><span class="fio"><b>Дежурит: ${dutyNow?esc(initials(dutyNow.fio)):'—'}</b>
        <small>следующий — ${order.length?esc(initials(order[(S.duty.idx+1)%order.length].fio)):'—'}</small></span>
        <button class="btn ghost" data-act="dutynext">Отдежурил</button></div>
    </div><ul>`;
  const q = norm(ctx.gq||'');
  S.students.forEach((s,i)=>{
    if(q && !norm(s.fio).includes(q)) return;
    const {n,u} = missCount(s.id);
    const dw = debtWorks(s.id).length;
    const fd = fundDebt(s.id);
    h += `<li class="card" data-id="${s.id}">
      <div class="lesson" data-act="openstud" data-id="${s.id}">
        <span class="num">${i+1}</span>
        <span class="t"><b>${esc(s.fio)}</b><span>${esc(s.phone||s.tg||'контактов нет')}</span></span>
      </div>
      <div class="chips">
        <span class="chip ${n>=S.limit?'bad':''}">${n} Н</span>
        <span class="chip ${u?'warn':''}">${u} У</span>
        <span class="chip ${dw?'bad':'ok'}">${dw?plural(dw,'долг','долга','долгов'):'всё сдано'}</span>
        ${fd?`<span class="chip bad">${fd} ₽</span>`:''}
      </div>
    </li>`;
  });
  h += `</ul><div class="row">
    <button class="btn ghost" data-act="addstud" style="flex:1">+ Человек</button>
    <button class="btn ghost" data-act="risk" style="flex:1">Кто под угрозой</button></div>`;
  return h;
}
function viewStudent(){
  const s = stud(ctx.stud);
  if(!s){ view=null; return viewGroup(); }
  const {n,u} = missCount(s.id);
  let h = head(s.fio, `${n} прогулов · ${u} по уважительной`, 1) + `</header>
    <div class="card">
      <div class="row"><input type="text" data-act="fphone" value="${esc(s.phone)}" placeholder="телефон"></div>
      <div class="row"><input type="text" data-act="ftg" value="${esc(s.tg)}" placeholder="телеграм"></div>
      <div class="row"><input type="text" data-act="fnote" value="${esc(s.note)}" placeholder="заметка: подгруппа, староста, что угодно"></div>
    </div>
    <h2>Пропуски по предметам</h2><ul>`;
  S.subjects.forEach(p=>{
    const c = missCount(s.id, p.id);
    if(!c.n && !c.u) return;
    h += `<li class="card"><div class="top"><span class="fio">${esc(p.name)}</span>
      <span class="chip ${c.n>=S.limit?'bad':''}">${c.n} Н</span>
      ${c.u?`<span class="chip warn">${c.u} У</span>`:''}</div></li>`;
  });
  if(!n && !u) h += `<div class="empty">Пропусков нет.</div>`;
  h += `</ul><h2>Несданные работы</h2><ul>`;
  const dw = debtWorks(s.id);
  if(!dw.length) h += `<div class="empty">Всё сдано.</div>`;
  dw.forEach(w=>{ h += `<li class="card"><div class="top"><span class="fio">${esc(w.name)}<small>${esc(subjName(w.subjectId))}${w.due?' · до '+fmtDate(w.due):''}</small></span></div></li>`; });
  h += `</ul><h2>Деньги</h2><ul>`;
  let any=false;
  S.funds.forEach(f=>{
    const paid=(S.pays[f.id]||{})[s.id]||0; const per=f.per||0;
    if(paid>=per && per>0) return; any=true;
    h += `<li class="card"><div class="top"><span class="fio">${esc(f.name)}</span>
      <span class="chip bad">${per-paid} ₽</span></div></li>`;
  });
  if(!any) h += `<div class="empty">Долгов нет.</div>`;
  h += `</ul><div class="row">
    <button class="btn ghost" data-act="msgstud" style="flex:1">Сводка в буфер</button>
    <button class="btn danger" data-act="delstud" style="flex:1">Удалить</button></div>`;
  return h;
}

/* ---------- ЕЩЁ ---------- */
async function loadCurriculum(){
  try{
    const response=await fetch('./data/curriculum.json',{cache:'no-store'});
    if(!response.ok || response.status===204)return;
    const rows=await response.json();
    if(!Array.isArray(rows)||!rows.length||!rows.every(r=>r&&typeof r.name==='string'&&typeof r.code==='string'&&['Экзамен','Зачёт','ЗачётСОценкой'].includes(r.control)&&[null,'КП','КР'].includes(r.extra)&&['lek','lab','pr','ze'].every(k=>Number.isFinite(r[k])&&r[k]>=0)))return;
    curriculum=rows;$('semester-tab').hidden=false;measureSoon();
  }catch{} // Optional static data: no unhandled errors, tab remains hidden.
}
function viewSemester(){
  const n=control=>curriculum.filter(r=>r.control===control).length;
  let h=head('Семестр','1 курс · 1 семестр · О-26-ИСТ-СИИ-Б')+'</header>';
  h+='<div class="card semester-summary"><span>'+plural(n('Экзамен'),'экзамен','экзамена','экзаменов')+'</span><span>'+plural(n('Зачёт')+n('ЗачётСОценкой'),'зачёт','зачёта','зачётов')+'</span><span>'+curriculum.filter(r=>r.extra).length+' курсовых</span><span>'+curriculum.reduce((s,r)=>s+r.ze,0)+' з.е.</span></div><p class="hint">По дисциплинам, подтверждённым расписанием. Часы: лекции / лабораторные / практические.</p><ul>';
  for(const r of curriculum)h+='<li class="card"><div class="grp">'+esc(r.code)+' · '+r.ze+' з.е.</div><div class="fio"><b>'+esc(r.name)+'</b></div><div class="chips"><span class="chip '+(r.control==='Экзамен'?'semester-exam':r.control==='ЗачётСОценкой'?'warn':'ok')+'">'+(r.control==='ЗачётСОценкой'?'Зачёт с оценкой':esc(r.control))+'</span>'+(r.extra?'<span class="chip warn">'+esc(r.extra)+'</span>':'')+'</div><p class="hint">Лек: '+r.lek+' · Лаб: '+r.lab+' · Пр: '+r.pr+' ч.<br>Кафедра '+esc(r.kafedra)+'</p></li>';
  return h+'</ul>';
}
function viewMore(){
  return head('Ещё') + `</header>
    <ul>
      <li class="card"><div class="lesson" data-act="goimport"><span class="t"><b>Сканировать и импортировать</b>
        <span>списки людей, преподавателей, предметов, отметки из журнала</span></span><span>›</span></div></li>
      <li class="card"><div class="lesson" data-act="godir" data-v="subjects"><span class="t"><b>Предметы</b>
        <span>${S.subjects.length} шт.</span></span><span>›</span></div></li>
      <li class="card"><div class="lesson" data-act="godir" data-v="teachers"><span class="t"><b>Преподаватели</b>
        <span>${S.teachers.length} шт.</span></span><span>›</span></div></li>
      <li class="card"><div class="lesson" data-act="gotpl"><span class="t"><b>Шаблон недели</b>
        <span>${S.tpl.length} пар в шаблоне</span></span><span>›</span></div></li>
      <li class="card"><div class="lesson" data-act="gobgtu"><span class="t"><b>Расписание БГТУ</b>
        <span>${esc((S.schedule&&S.schedule.group)||'О-26-ИСТ-СИИ-Б')} · ${(S.schedule&&S.schedule.week==='even')?'чётная':'нечётная'} неделя</span></span><span>›</span></div></li>
    </ul>
    <h2>Выгрузка</h2>
    <div class="row wrap-it">
      <button class="btn ghost" data-act="csvatt" style="flex:1">Посещаемость в CSV</button>
      <button class="btn ghost" data-act="csvworks" style="flex:1">Сдачи в CSV</button>
    </div>
    <h2>Резервная копия</h2>
    <div class="row wrap-it">
      <button class="btn ghost" data-act="backup" style="flex:1">Сохранить файл</button>
      <button class="btn ghost" data-act="restore" style="flex:1">Загрузить файл</button>
    </div>
    <h2>Настройки</h2>
    <div class="card">
      <div class="row"><input type="number" inputmode="numeric" data-act="limit" value="${S.limit}" placeholder="порог"></div>
      <p class="hint">Сколько прогулов по предмету, чтобы подсветить человека красным.</p>
    </div>
      <p class="hint">Журнал хранится в облаке. Копия на устройстве сохраняется только с твоего согласия и удаляется при выходе.</p>
    <p class="hint">Версия ${APP_V}</p>
    <div style="height:20px"></div>`;
}

function pairFromTime(time){
  const m = String(time||'').match(/^(\d{1,2}):(\d{2})/);
  if(!m) return 0;
  const mins = (+m[1])*60 + (+m[2]);
  const starts = [480,585,690,800,905,1010,1120,1210];
  const ix = starts.indexOf(mins);
  return ix>=0 ? ix+1 : 0;
}

function bgtuWeekLabel(w){ return w==='even'?'чётная':'нечётная'; }
function bgtuTpls(week){
  return (S.tpl||[]).filter(t=>t.source==='bgtu' && (t.week||'odd')===week);
}
function bgtuCurrentWeekForDate(iso){
  const anchor=S.schedule?.weekAnchor || todayISO();
  const monday=d=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.getTime();};
  const weeks=Math.round((monday(iso)-monday(anchor))/604800000);
  const base=S.schedule?.currentWeek || S.schedule?.week || 'odd';
  return Math.abs(weeks)%2 ? (base==='odd'?'even':'odd') : base;
}

function ensureBGTULessonsForDate(iso){
  
  const week = bgtuCurrentWeekForDate(iso);
  const dow = dowOf(iso);
  const rows = bgtuTpls(week).filter(t=>t.dow===dow).sort((a,b)=>(a.pair||99)-(b.pair||99));
  if(!rows.length) return 0;
  let made=0;
  for(const t of rows){
    const exists=S.lessons.some(l=>l.date===iso && l.source==='bgtu' && l.time===t.time && l.subjectId===t.subjectId && l.week===week);
    if(exists) continue;
    S.lessons.push({id:uid('l'),date:iso,pair:t.pair,subjectId:t.subjectId,kind:t.kind||'',room:t.room||'',teacherId:t.teacherId||'',week,time:t.time||'',source:'bgtu'});
    made++;
  }
  if(made) save();
  return made;
}

function applyBGTUSchedule(data){
  const rows=Array.isArray(data?.lessons)?data.lessons:[];
  if(!rows.length) throw new Error('БГТУ вернуло пустое расписание');

  // Удаляем только ранее импортированные БГТУ-шаблоны. Ручные шаблоны пользователя не трогаем.
  S.tpl=(S.tpl||[]).filter(t=>t.source!=='bgtu');

  // Удаляем только будущие неотмеченные автоматически созданные БГТУ-занятия,
  // чтобы обновление действительно отражалось в календаре, не ломая историю посещаемости.
  const today=todayISO();
  S.lessons=(S.lessons||[]).filter(l=>{
    if(l.source!=='bgtu' || l.date<today) return true;
    const hasMarks=Object.keys(S.att[l.id]||{}).length>0;
    return hasMarks;
  });

  const subjectMap=new Map();
  const teacherMap=new Map();
  for(const p of (S.subjects||[])) subjectMap.set(norm(p.name),p);
  for(const t of (S.teachers||[])) teacherMap.set(norm(t.fio),t);

  let made=0, addedSubjects=0, addedTeachers=0;
  const seen=new Set();
  for(const r of rows){
    const week=r.week==='even'?'even':'odd';
    const subject=String(r.subject||'').trim();
    if(!subject || !r.dow || !r.time) continue;
    let p=subjectMap.get(norm(subject));
    if(!p){
      p={id:uid('p'),name:subject,control:'',teacherId:''};
      S.subjects.push(p); subjectMap.set(norm(subject),p); addedSubjects++;
    }
    let t=null;
    const teacher=String(r.teacher||'').trim();
    if(teacher){
      t=teacherMap.get(norm(teacher));
      if(!t){
        t={id:uid('t'),fio:teacher,dept:'',contact:'',note:''};
        S.teachers.push(t); teacherMap.set(norm(teacher),t); addedTeachers++;
      }
    }
    const key=[week,r.dow,r.time,norm(subject),norm(r.kind||''),norm(teacher),norm(r.room||'')].join('|');
    if(seen.has(key)) continue;
    seen.add(key);
    const pair=+r.pair||pairFromTime(r.time)||1;
    S.tpl.push({
      id:uid('x'),source:'bgtu',group:S.schedule.group,week,dow:+r.dow,pair,
      subjectId:p.id,kind:String(r.kind||'').trim(),room:String(r.room||'').trim(),
      teacherId:t?t.id:'',time:String(r.time||'').trim()
    });
    made++;
  }

  S.schedule.lastSyncAt=new Date(data.fetchedAt).toLocaleString('ru-RU');
  S.schedule.fetchedAt=data.fetchedAt;
  if(data.period){const parts=data.period.split('_');S.schedule.year=parts[0];S.schedule.semester=Number(parts[1])||1;}
  S.schedule.currentWeek=data.currentWeek==='even'?'even':'odd';
  S.schedule.week=S.schedule.currentWeek;
  S.schedule.weekAnchor=new Date(data.fetchedAt).toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
  S.schedule.lastError='';
  S.schedule.remote=data.source||'БГТУ';

  ensureBGTULessonsForDate(curDate);
  save();
  render();
  
  return {made,addedSubjects,addedTeachers};
}

async function loadScheduleSnapshot(){
  if(window.cloudScheduleBlocked?.())return;
  const targetState=S;
  async function load(url){
    const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),20000);
    try{
      const res=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'},signal:ac.signal});
      const data=await res.json();
      if(!res.ok||!data?.ok||!Array.isArray(data.lessons)||!data.lessons.length||!Number.isFinite(Date.parse(data.fetchedAt)))throw new Error('Invalid schedule');
      return data;
    }finally{clearTimeout(timer);}
  }
  let data;
  try{
    if(window.STAROSTA_SUPABASE_URL){
      try{data=await load(window.STAROSTA_SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/fetch-schedule');}
      catch{data=await load('./schedule.json');}
    }else data=await load('./schedule.json');
    if(S!==targetState||window.cloudScheduleBlocked?.())return;
    if(Date.parse(data.fetchedAt)<Date.parse(S.schedule?.fetchedAt||''))return;
    const same=data.contentHash?data.contentHash===S.schedule?.contentHash:data.fetchedAt===S.schedule?.fetchedAt;
    if(!same)applyBGTUSchedule(data);
    S.schedule.fetchedAt=data.fetchedAt;
    S.schedule.lastSyncAt=new Date(data.fetchedAt).toLocaleString('ru-RU');
    S.schedule.contentHash=data.contentHash||null;
    S.schedule.lastError='';
    save();render();
  }catch{
    // Offline/missing fallback never overwrites existing lessons or shows a toast.
    if(S===targetState)render();
  }
}

function viewBGTU(){
  const m=S.schedule||{};
  const odd=bgtuTpls('odd').length, even=bgtuTpls('even').length;
  const hasData=odd||even;
    let h=head('Расписание БГТУ','официальное расписание',1)+`</header>`;
  h+=`<div class="card">
    <div class="fio"><b>${esc(m.group||'О-26-ИСТ-СИИ-Б')}</b></div>
    <p class="bgtu-source">${esc(m.profile||'Системы искусственного интеллекта и обработка больших данных')} · ${esc(m.code||'09.03.02')} · ${esc(m.form||'Очное')}</p>
    <div class="bgtu-meta">
      <span class="chip">${esc(m.year||'2026-2027')}</span>
      <span class="chip">${m.semester||1} семестр</span>
      <span class="chip">${esc(m.education||'бакалавр')}</span>
    </div>
    <div class="bgtu-week">
      <button class="btn ghost ${m.week==='odd'?'active':''}" data-act="setweek" data-v="odd">Нечётная</button>
      <button class="btn ghost ${m.week==='even'?'active':''}" data-act="setweek" data-v="even">Чётная</button>
    </div>
    <p class="bgtu-source ${m.fetchedAt&&Date.now()-Date.parse(m.fetchedAt)>21600000?'schedule-stale':''}">Обновлено: ${m.fetchedAt?esc(new Date(m.fetchedAt).toLocaleString('ru-RU')):'нет снимка'}</p>
    ${m.fetchedAt&&Date.now()-Date.parse(m.fetchedAt)>21600000?'<p class="hint schedule-stale" role="status">Снимок старше 6 часов. Возможны изменения в расписании.</p>':''}
    ${hasData?`<div class="bgtu-meta"><span class="chip ok">Нечётная: ${odd}</span><span class="chip">Чётная: ${even}</span></div>`:''}
  </div>`;
  h+=`<div class="card"><p class="hint">Параметры зафиксированы: ФИТ · бакалавр · 09.03.02 · «Системы искусственного интеллекта и обработка больших данных» · очная · ${esc(m.group||'О-26-ИСТ-СИИ-Б')}. Расписание загружается из официального источника. Дата получения указана выше. Нечётная и чётная недели хранятся отдельно.</p></div>`;
  if(hasData){
    const rows=(m.week==='even'?bgtuTpls('even'):bgtuTpls('odd')).sort((a,b)=>a.dow-b.dow || a.pair-b.pair);
    h+=`<h2>${bgtuWeekLabel(m.week)} неделя · превью</h2><ul>`;
    rows.forEach(r=>{
      h+=`<li class="card"><div class="top"><span class="pairno">${r.pair||'—'}</span><span class="fio"><b>${esc(DOW[r.dow]||'')}</b><small>${esc(r.time||'')}${r.subjectId?` · ${esc(subjName(r.subjectId))}`:''}${r.teacherId?` · ${esc(initials(teachName(r.teacherId)))}`:''}${r.room?' · '+esc(r.room):''}</small></span></div></li>`;
    });

    h+=`</ul>`;
  }
  h+=`<div class="row"><button class="btn ghost wide" data-act="openbgtu">Открыть официальный сайт БГТУ</button></div>`;
  return h;
}


function viewDir(){
  const isT = ctx.dir==='teachers';
  const items = isT ? S.teachers : S.subjects;
  let h = head(isT?'Преподаватели':'Предметы', '', 1) + `</header><ul>`;
  if(!items.length) h += `<div class="empty">Пусто. Добавь вручную или отсканируй список.</div>`;
  items.forEach((it,i)=>{
    h += `<li class="card" data-id="${it.id}"><div class="top">
      <span class="num">${i+1}</span>
      <span class="fio">${esc(isT?it.fio:it.name)}<small>${esc(isT?(it.dept||''):(it.control||''))}</small></span>
      <button class="iconbtn" data-act="editdir" data-id="${it.id}">✎</button>
      <button class="iconbtn" data-act="deldir" data-id="${it.id}">🗑</button>
    </div></li>`;
  });
  h += `</ul><div class="row"><button class="btn wide" data-act="adddir">+ Добавить</button></div>`;
  return h;
}
function viewTpl(){
  let h = head('Шаблон недели', 'постоянное расписание', 1) + `</header><ul>`;
  if(!S.tpl.length) h += `<div class="empty">Шаблон пуст. Забей сюда расписание один раз —<br>и дни будут заполняться в один тап.</div>`;
  [1,2,3,4,5,6].forEach(d=>{
    const rows = S.tpl.filter(t=>t.dow===d).sort((a,b)=>a.pair-b.pair);
    if(!rows.length) return;
    h += `<h2>${DOW[d]}</h2>`;
    rows.forEach(t=>{
      h += `<li class="card"><div class="top"><span class="pairno">${t.pair}</span>
        <span class="fio">${esc(subjName(t.subjectId))}<small>${esc(t.kind||'')}${t.room?' · ауд. '+esc(t.room):''}</small></span>
        <button class="iconbtn" data-act="deltpl" data-id="${t.id}">🗑</button></div></li>`;
    });
  });
  h += `</ul><div class="row"><button class="btn wide" data-act="addtpl">+ Пара в шаблон</button></div>`;
  return h;
}

/* ---------- ИМПОРТ / СКАНЕР ---------- */
const IMPORT_MODES = {
  people:  {t:'Список людей',        hint:'Одна строка — один человек. Номера в начале строки убираются сами.'},
  teachers:{t:'Список преподавателей',hint:'ФИО, а после тире — кафедра или предмет. Тире можно не ставить.'},
  subjects:{t:'Список предметов',    hint:'Одна строка — один предмет. После тире можно указать зачёт или экзамен.'},
  marks:   {t:'Отметки из журнала',  hint:'Фамилия, а рядом Н, У, плюс или минус. Фамилии сопоставятся с группой автоматически.'}
};
function viewImport(){
  const mode = ctx.imode || 'people';
  const m = IMPORT_MODES[mode];
  let h = head('Сканировать', m.t, 1) + `
    <div class="row"><select id="imode">
      ${Object.entries(IMPORT_MODES).map(([k,v])=>`<option value="${k}"${k===mode?' selected':''}>${v.t}</option>`).join('')}
    </select></div></header>
    <p class="hint">Самый точный способ на айфоне: открой «Камеру», наведи на лист, нажми значок «Живого текста» в углу кадра, выдели и скопируй — потом вставь сюда. Распознаёт система, офлайн и по-русски.</p>
    <div class="row"><textarea id="raw" placeholder="Вставь сюда текст со скана">${esc(ctx.raw||'')}</textarea></div>
    <div class="row wrap-it">
      <button class="btn ghost" data-act="ocr" style="flex:1">Распознать фото в приложении</button>
      <button class="btn" data-act="parse" style="flex:1">Разобрать</button>
    </div>
    <div id="ocrbox"></div>
    <p class="hint">${m.hint}</p>`;

  if(ctx.rows && ctx.rows.length){
    h += `<h2>Проверь перед импортом</h2><div class="card"><table class="prev">`;
    ctx.rows.forEach((r,i)=>{
      h += `<tr>
        <td class="st"><button class="iconbtn" data-act="togglerow" data-i="${i}">${r.on?'✓':'·'}</button></td>
        <td>${esc(r.text)}${r.match?`<br><small>→ ${esc(r.match.fio)}${r.status?' · '+({n:'Н — прогул',u:'У — уважительная',ok:'был на паре'}[r.status]||''):''}</small>`
            :r.needMatch?`<br><small style="color:var(--bad)">не нашёл такого в группе</small>`:''}</td>
      </tr>`;
    });
    h += `</table></div><div class="row"><button class="btn wide" data-act="doimport">Импортировать ${ctx.rows.filter(r=>r.on).length}</button></div>`;
  }
  if(ctx.imode==='marks'){
    h += `<p class="hint">Отметки лягут на пару, выбранную на вкладке «Пары» (${fmtDate(curDate)}). Если пар в этот день нет, сначала добавь пару.</p>`;
  }
  return h + `<div style="height:20px"></div>`;
}
function parseRaw(){
  const mode = ctx.imode||'people';
  const lines = String(ctx.raw||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const rows = [];
  lines.forEach(line=>{
    let t = line.replace(/^\s*\d+\s*[.)|]?\s*/,'').trim();
    if(!t) return;
    if(mode==='marks'){
      let status='n', fio=t;
      const tail = t.match(/(.+?)[\s|:;,]+([НнHhУуNn+\-–—✓✗xXхХ])\s*$/);
      if(tail){ fio = tail[1]; const c=tail[2].toLowerCase();
        if('уu'.includes(c)) status='u';
        else if('+✓'.includes(c)) status='ok';
        else status='n';
      }
      const match = matchStudent(fio);
      rows.push({text:t, fio:fio.trim(), status, match, needMatch:true, on:!!match});
    } else if(mode==='people'){
      if(t.split(/\s+/).length<2) return;
      rows.push({text:t, fio:t, on:true});
    } else if(mode==='teachers'){
      const [fio, rest] = t.split(/\s+[—–-]\s+/);
      rows.push({text:t, fio:fio.trim(), dept:(rest||'').trim(), on:true});
    } else {
      const [name, rest] = t.split(/\s+[—–-]\s+/);
      rows.push({text:t, name:name.trim(), control:(rest||'').trim(), on:true});
    }
  });
  ctx.rows = rows;
  if(!rows.length) toast('Ничего не разобрал — проверь текст');
}
function doImport(){
  const mode = ctx.imode||'people';
  const rows = (ctx.rows||[]).filter(r=>r.on);
  if(!rows.length) return toast('Нечего импортировать');
  if(mode==='people'){
    rows.forEach(r=>{ if(!matchStudent(r.fio)) S.students.push({id:uid('s'),fio:r.fio,phone:'',tg:'',note:''}); });
    S.students.sort((a,b)=>a.fio.localeCompare(b.fio,'ru'));
    toast('Список группы обновлён');
  } else if(mode==='teachers'){
    rows.forEach(r=>{ if(!S.teachers.some(t=>norm(surname(t.fio))===norm(surname(r.fio))))
      S.teachers.push({id:uid('t'),fio:r.fio,dept:r.dept||'',contact:'',note:''}); });
    toast('Преподаватели добавлены');
  } else if(mode==='subjects'){
    rows.forEach(r=>{ if(!S.subjects.some(p=>norm(p.name)===norm(r.name)))
      S.subjects.push({id:uid('p'),name:r.name,control:r.control||'',teacherId:''}); });
    toast('Предметы добавлены');
  } else {
    const ls = lessonsOn(curDate);
    if(!ls.length) return toast('На ' + fmtDate(curDate) + ' пар нет');
    const l = ls[0];
    const a = attOf(l.id);
    let k=0;
    rows.forEach(r=>{ if(!r.match) return;
      if(r.status==='ok') delete a[r.match.id]; else a[r.match.id]=r.status;
      k++; });
    toast(`Отмечено ${k} на паре: ${subjName(l.subjectId)}`);
  }
  ctx.rows=null; ctx.raw='';
  save(); render();
}
async function runOCR(){
  const inp = document.getElementById('ocr-upload') || document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.id='ocr-upload'; inp.hidden=true; document.body.appendChild(inp);
  inp.onchange = async () => {
    const f = inp.files[0]; inp.value=''; if(!f) return;
    const box = $('ocrbox');
    box.innerHTML = `<div class="card"><div class="hint">Готовлю распознавание…</div><progress id="pg" value="0" max="1"></progress></div>`;
    try{
      if(!window.Tesseract){
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src=new URL('vendor/ocr/tesseract.min.js',document.baseURI).href;
          s.onload=res; s.onerror=()=>rej(new Error('нет сети'));
          document.head.appendChild(s);
        });
      }
      const assetBase=new URL('vendor/ocr/',document.baseURI).href;
      const worker=await Tesseract.createWorker('rus',1,{workerPath:assetBase+'worker.min.js',corePath:assetBase,langPath:assetBase,workerBlobURL:true,logger:m=>{
        const pg=$('pg'); if(pg && m.progress!=null) pg.value=m.progress;
        const b=$('ocrbox').querySelector('.hint'); if(b) b.textContent = m.status==='recognizing text'?'Читаю текст…':'Загружаю словарь…';
      }});
      let r;
      try { await worker.setParameters({user_defined_dpi:'300'}); r=await worker.recognize(f); } finally { await worker.terminate(); }
      ctx.raw = r.data.text;
      parseRaw(); render();
      toast('Распознал — проверь строки');
    }catch(e){
      box.innerHTML = `<div class="card"><div class="hint">Не вышло: ${esc(e.message)}.<br>
        Словарь качается один раз при первом запуске — нужен интернет. Дальше работает офлайн.<br>
        Пока можно вставить текст через «Живой текст» камеры.</div></div>`;
    }
  };
  inp.click();
}

/* ============================ ДЕЙСТВИЯ ============================ */
document.addEventListener('click', async e=>{
  const nb = e.target.closest('#nav button');
  if(nb){ tab=nb.dataset.tab; view=null; ctx={}; return render(); }
  const btn = e.target.closest('[data-act]');
  if(!btn) return;
  const act = btn.dataset.act;
  const li  = e.target.closest('li[data-id]');
  const sid = li ? li.dataset.id : null;

  switch(act){
    case 'back': view=null; ctx={...ctx, rows:null}; break;
    case 'dshift': { const d=new Date(curDate+'T12:00:00'); d.setDate(d.getDate()+ +btn.dataset.v);
      curDate=d.toISOString().slice(0,10); break; }
    case 'today': curDate=todayISO(); break;

    case 'openatt': view='att'; ctx.lesson=btn.dataset.id; break;
    case 'mark': { const a=attOf(ctx.lesson); const v=btn.dataset.v;
      if(a[sid]===v) delete a[sid]; else a[sid]=v; save(); break; }
    case 'clearatt': if(await askConfirm('Снять все отметки на этой паре?')){ S.att[ctx.lesson]={}; save(); } break;
    case 'attreport': { const l=S.lessons.find(x=>x.id===ctx.lesson); const a=S.att[l.id]||{};
      const nn=S.students.filter(s=>a[s.id]==='n'), uu=S.students.filter(s=>a[s.id]==='u');
      copy(`${S.group} · ${fmtDate(l.date)} · ${l.pair} пара · ${subjName(l.subjectId)}\n`+
        `Отсутствовали (Н): ${nn.length?nn.map(s=>initials(s.fio)).join(', '):'нет'}\n`+
        `По уважительной (У): ${uu.length?uu.map(s=>initials(s.fio)).join(', '):'нет'}\n`+
        `Присутствовало: ${S.students.length-nn.length-uu.length} из ${S.students.length}`, 'Отчёт в буфере'); return; }
    case 'addlesson': {
      if(!S.subjects.length) return toast('Сначала добавь предметы');
      const list = S.subjects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
      const pick = await askText('Предмет — номер из списка:\n'+list, '1'); if(!pick) return;
      const p = S.subjects[+pick-1]; if(!p) return toast('Нет такого номера');
      const pair = await askText('Номер пары', '1'); if(!pair) return;
      const kind = await askText('Тип: '+KINDS.join(' / '), 'практика')||'';
      const room = await askText('Аудитория (можно пусто)','')||'';
      S.lessons.push({id:uid('l'),date:curDate,pair:+pair,subjectId:p.id,kind,room,teacherId:p.teacherId||''});
      save(); break; }
    case 'editlesson': {
      const l = S.lessons.find(x=>x.id===btn.dataset.id);
      if(!l) return;
      if(!S.subjects.length) return toast('Сначала добавь предметы');
      const list = S.subjects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
      const cur = S.subjects.findIndex(p=>p.id===l.subjectId) + 1;
      const pick = await askText('Предмет — номер из списка:\n'+list, String(cur||1));
      if(pick===null) return;
      const p = S.subjects[+pick-1];
      if(!p) return toast('Нет такого номера');
      const pair = await askText('Номер пары', String(l.pair)); if(pair===null) return;
      const kind = await askText('Тип: '+KINDS.join(' / '), l.kind||''); if(kind===null) return;
      const room = await askText('Аудитория (можно пусто)', l.room||''); if(room===null) return;
      const date = await askText('Дата в формате ГГГГ-ММ-ДД', l.date); if(date===null) return;
      l.subjectId = p.id;
      l.pair = +pair || l.pair;
      l.kind = kind.trim();
      l.room = room.trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(date.trim())){
        l.date = date.trim();
        if(l.date !== curDate){ curDate = l.date; view = null; }
      } else if(date.trim() !== l.date){ toast('Дату не понял — оставил прежнюю'); }
      save(); break; }
    case 'dellesson': if(await askConfirm('Удалить пару вместе с отметками?')){
      const id=btn.dataset.id; S.lessons=S.lessons.filter(l=>l.id!==id); delete S.att[id]; save(); } break;
    case 'fromtpl': {
      const d=dowOf(curDate);
      const selectedWeek = bgtuCurrentWeekForDate(curDate);
      const rows=S.tpl.filter(t=>t.dow===d && (!t.week || t.week===selectedWeek));
      if(!rows.length) return toast('В шаблоне нет пар на '+DOW[d]);
      let k=0;
      rows.forEach(t=>{ if(S.lessons.some(l=>l.date===curDate && l.pair===t.pair)) return;
        S.lessons.push({id:uid('l'),date:curDate,pair:t.pair,subjectId:t.subjectId,kind:t.kind,room:t.room,teacherId:t.teacherId||'',week:t.week||selectedWeek,time:t.time||'',source:t.source==='bgtu'?'bgtu':'manual'}); k++; });
      save(); toast(k?`Добавлено пар: ${k}`:'Уже всё стоит'); break; }
    case 'daysum': {
      const ls=lessonsOn(curDate);
      if(!ls.length) return toast('Пар нет');
      let txt=`${S.group} · ${fmtDate(curDate)}\n`;
      ls.forEach(l=>{ const a=S.att[l.id]||{};
        const nn=S.students.filter(s=>a[s.id]==='n').map(s=>initials(s.fio));
        const uu=S.students.filter(s=>a[s.id]==='u').map(s=>initials(s.fio));
        txt+=`\n${l.pair} пара — ${subjName(l.subjectId)}\n  Н: ${nn.join(', ')||'нет'}\n  У: ${uu.join(', ')||'нет'}\n`; });
      copy(txt,'Отчёт за день в буфере'); return; }

    case 'openwork': view='work'; ctx.work=btn.dataset.id; ctx.q=''; break;
    case 'smark': { const m=subsOf(ctx.work); const c=m[sid]||(m[sid]={s:null,mark:'',note:''});
      c.s = c.s===btn.dataset.v ? null : btn.dataset.v; save(); break; }
    case 'opennote': { const nl=li.querySelector('.noteline'); nl.classList.toggle('open');
      const i=nl.querySelector('input'); if(nl.classList.contains('open')) i.focus(); return; }
    case 'addwork': {
      if(!S.subjects.length) return toast('Сначала добавь предметы');
      const list=S.subjects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
      const pick=await askText('Предмет — номер:\n'+list,'1'); if(!pick) return;
      const p=S.subjects[+pick-1]; if(!p) return toast('Нет такого номера');
      const name=await askText('Название работы','Лабораторная 1'); if(!name) return;
      const due=await askText('Дедлайн в формате ГГГГ-ММ-ДД (можно пусто)','')||'';
      S.works.push({id:uid('w'),subjectId:p.id,name:name.trim(),due:due.trim()}); save(); break; }
    case 'delwork': if(await askConfirm('Удалить работу вместе с отметками?')){
      delete S.subs[ctx.work]; S.works=S.works.filter(w=>w.id!==ctx.work); view=null; save(); } break;
    case 'workreport': { const w=S.works.find(x=>x.id===ctx.work); const m=S.subs[w.id]||{};
      const line=s=>{ const c=m[s.id]||{}; return `${c.s==='y'?'+':c.s==='n'?'−':'·'} ${s.fio}`+
        ((c.mark||c.note)?' — '+[c.mark,c.note].filter(Boolean).join(' · '):''); };
      copy(`${S.group} · ${w.name} (${subjName(w.subjectId)})\n`+S.students.map(line).join('\n'),'Отчёт в буфере'); return; }

    case 'openfund': view='fund'; ctx.fund=btn.dataset.id; break;
    case 'pay': { const f=S.funds.find(x=>x.id===ctx.fund); const p=paysOf(f.id);
      p[sid] = (p[sid]||0)>=(f.per||0) ? 0 : (f.per||0); save(); break; }
    case 'addfund': { const name=await askText('На что собираем?','На нужды группы'); if(!name) return;
      const per=await askText('Сколько с человека, ₽','200'); if(per===null) return;
      S.funds.push({id:uid('f'),name:name.trim(),per:+per||0}); save(); break; }
    case 'delfund': if(await askConfirm('Удалить сбор?')){ delete S.pays[ctx.fund];
      S.funds=S.funds.filter(f=>f.id!==ctx.fund); view=null; save(); } break;
    case 'fundreport': { const f=S.funds.find(x=>x.id===ctx.fund); const p=S.pays[f.id]||{};
      const debt=S.students.filter(s=>(p[s.id]||0)<(f.per||0));
      copy(`${S.group} · ${f.name} — по ${f.per} ₽\nНе сдали (${debt.length}): `+
        (debt.map(s=>initials(s.fio)+((p[s.id]||0)?` (${p[s.id]})`:'')).join(', ')||'нет'),'Список должников в буфере'); return; }

    case 'openstud': view='student'; ctx.stud=btn.dataset.id; break;
    case 'addstud': { const fio=await askText('ФИО полностью'); if(!fio) return;
      S.students.push({id:uid('s'),fio:fio.trim(),phone:'',tg:'',note:''});
      S.students.sort((a,b)=>a.fio.localeCompare(b.fio,'ru')); save(); break; }
    case 'delstud': if(await askConfirm('Удалить человека из группы?')){
      S.students=S.students.filter(x=>x.id!==ctx.stud); view=null; save(); } break;
    case 'msgstud': { const s=stud(ctx.stud); const {n,u}=missCount(s.id); const dw=debtWorks(s.id);
      copy(`${s.fio}\nПропуски: ${n} Н, ${u} У\nНе сдано: ${dw.length?dw.map(w=>w.name).join(', '):'всё сдано'}\n`+
        `Долг по сборам: ${fundDebt(s.id)} ₽`,'Сводка в буфере'); return; }
    case 'dutynext': { const s=S.students[S.duty.idx % S.students.length];
      if(s){ S.duty.log.push({date:todayISO(),studentId:s.id}); S.duty.idx=(S.duty.idx+1)%S.students.length; save(); } break; }
    case 'risk': { const bad=S.students.filter(s=>missCount(s.id).n>=S.limit);
      copy(`${S.group} · ${S.limit}+ прогулов\n`+(bad.length?bad.map(s=>`${initials(s.fio)} — ${missCount(s.id).n} Н`).join('\n'):'таких нет'),
        bad.length?`Под угрозой: ${bad.length}`:'Все в порядке'); return; }

    case 'goimport': view='import'; ctx={imode:'people',raw:'',rows:null}; break;
    case 'gobgtu': view='bgtu'; break;
    case 'setweek': { if(S.schedule) S.schedule.week=btn.dataset.v; break; }
    case 'openbgtu': window.open('https://www.tu-bryansk.ru/education/schedule/','_blank','noopener'); return;
    case 'godir': view='dir'; ctx.dir=btn.dataset.v; break;
    case 'gotpl': view='tpl'; break;
    case 'adddir': {
      if(ctx.dir==='teachers'){ const fio=await askText('ФИО преподавателя'); if(!fio) return;
        const dept=await askText('Кафедра или предмет','')||'';
        S.teachers.push({id:uid('t'),fio:fio.trim(),dept,contact:'',note:''}); }
      else { const name=await askText('Название предмета'); if(!name) return;
        const control=await askText('Форма контроля: зачёт / экзамен / дифзачёт','')||'';
        S.subjects.push({id:uid('p'),name:name.trim(),control,teacherId:''}); }
      save(); break; }
    case 'editdir': { const id=btn.dataset.id;
      if(ctx.dir==='teachers'){ const t=S.teachers.find(x=>x.id===id);
        const fio=await askText('ФИО',t.fio); if(fio){ t.fio=fio.trim(); t.dept=await askText('Кафедра или предмет',t.dept)||t.dept; } }
      else { const p=S.subjects.find(x=>x.id===id);
        const name=await askText('Название',p.name); if(name){ p.name=name.trim(); p.control=await askText('Форма контроля',p.control)||p.control; } }
      save(); break; }
    case 'deldir': { const id=btn.dataset.id;
      if(!await askConfirm('Удалить?')) return;
      if(ctx.dir==='teachers') S.teachers=S.teachers.filter(x=>x.id!==id);
      else S.subjects=S.subjects.filter(x=>x.id!==id);
      save(); break; }
    case 'addtpl': {
      if(!S.subjects.length) return toast('Сначала добавь предметы');
      const dw=await askText('День недели: 1 пн, 2 вт, 3 ср, 4 чт, 5 пт, 6 сб','1'); if(!dw) return;
      const list=S.subjects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
      const pick=await askText('Предмет — номер:\n'+list,'1'); if(!pick) return;
      const p=S.subjects[+pick-1]; if(!p) return toast('Нет такого номера');
      const pair=await askText('Номер пары','1'); if(!pair) return;
      const kind=await askText('Тип: '+KINDS.join(' / '),'практика')||'';
      const room=await askText('Аудитория','')||'';
      S.tpl.push({id:uid('x'),dow:+dw,pair:+pair,subjectId:p.id,kind,room}); save(); break; }
    case 'deltpl': S.tpl=S.tpl.filter(t=>t.id!==btn.dataset.id); save(); break;

    case 'ocr': runOCR(); return;
    case 'parse': ctx.raw=$('raw').value; parseRaw(); break;
    case 'togglerow': { const r=ctx.rows[+btn.dataset.i]; r.on=!r.on; break; }
    case 'doimport': doImport(); return;

    case 'csvatt': exportAtt(); return;
    case 'csvworks': exportWorks(); return;
    case 'backup': download('starosta-backup-'+todayISO()+'.json', JSON.stringify(S), 'application/json'); return;
    case 'restore': restore(); return;
  }
  render();
});
document.addEventListener('change', e=>{
  const t=e.target, act=t.dataset.act;
  const li=t.closest('li[data-id]'); const sid=li?li.dataset.id:null;
  if(t.id==='curDate'){ if(!t.value)return; curDate=t.value; return render(); }
  if(t.id==='imode'){ ctx.imode=t.value; ctx.rows=null; return render(); }
  if(act==='note'){ const m=subsOf(ctx.work); const c=m[sid]||(m[sid]={s:null,mark:'',note:''});
    c.mark=''; c.note=t.value.trim(); save(); return render(); }
  if(act==='paysum'){ paysOf(ctx.fund)[sid]=+t.value||0; save(); return render(); }
  if(act==='fphone'){ stud(ctx.stud).phone=t.value.trim(); save(); return; }
  if(act==='ftg'){ stud(ctx.stud).tg=t.value.trim(); save(); return; }
  if(act==='fnote'){ stud(ctx.stud).note=t.value.trim(); save(); return; }
  if(act==='limit'){ S.limit=+t.value||3; save(); return; }
});
document.addEventListener('input', e=>{
  if(e.target.id==='q'){ ctx.q=e.target.value; const p=e.target.selectionStart; render();
    const n=$('q'); if(n){ n.focus(); n.setSelectionRange(p,p); } }
  if(e.target.id==='gq'){ ctx.gq=e.target.value; const p=e.target.selectionStart; render();
    const n=$('gq'); if(n){ n.focus(); n.setSelectionRange(p,p); } }
  if(e.target.id==='raw'){ ctx.raw=e.target.value; }
});

/* ============================ ЭКСПОРТ ============================ */
function download(name, text, type){
  const blob=new Blob([type==='application/json'?text:'\ufeff'+text],{type:(type||'text/csv')+';charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500);
  toast('Файл готов');
}
function exportAtt(){
  const ls=S.lessons.slice().sort((a,b)=> a.date===b.date ? a.pair-b.pair : (a.date<b.date?-1:1));
  if(!ls.length) return toast('Пар ещё нет');
  let rows=[];
  rows.push(['','Дата',...ls.map(l=>fmtDate(l.date))]);
  rows.push(['','Пара',...ls.map(l=>l.pair)]);
  rows.push(['','Предмет',...ls.map(l=>subjName(l.subjectId))]);
  rows.push(['№','Студент',...ls.map(()=>''),'Н','У']);
  S.students.forEach((s,i)=>{
    const cells=ls.map(l=>{ const v=(S.att[l.id]||{})[s.id]; return v==='n'?'Н':v==='u'?'У':''; });
    const c=missCount(s.id);
    rows.push([i+1,s.fio,...cells,c.n,c.u]);
  });
  download(`Посещаемость_${S.group}_${todayISO()}.csv`, rows.map(r=>r.join(';')).join('\n'));
}
function exportWorks(){
  if(!S.works.length) return toast('Работ ещё нет');
  const rows=[['№','Студент',...S.works.map(w=>`${subjName(w.subjectId)}: ${w.name}`)]];
  S.students.forEach((s,i)=>{
    rows.push([i+1,s.fio,...S.works.map(w=>{ const c=(S.subs[w.id]||{})[s.id]||{};
      return c.s==='y' ? (c.note||'сдал') : c.s==='n' ? 'не сдал' : ''; })]);
  });
  download(`Сдачи_${S.group}_${todayISO()}.csv`, rows.map(r=>r.map(x=>String(x).replace(/;/g,',')).join(';')).join('\n'));
}
function restore(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return;
    const fr=new FileReader();
    fr.onload=async()=>{ try{ const d=JSON.parse(fr.result);
        if(!d.students) throw new Error('не тот файл');
        if(!await askConfirm('Заменить все текущие данные содержимым файла?')) return;
        S=Object.assign(fresh(),d); save(); view=null; render(); toast('Данные восстановлены');
      }catch(e){ toast('Файл не подошёл'); } };
    fr.readAsText(f); };
  inp.click();
}

/* ============================ ЗАМЕРЫ УСТРОЙСТВА ============================ */
/* Ничего не хардкодим: высоту панели, зазор до низа экрана и высоту клавиатуры
   спрашиваем у самого телефона и складываем в CSS-переменные. */
const root = document.documentElement;
let _mz;
function measure(){
  const nav = $('nav');
  if(!nav) return;
  const r = nav.getBoundingClientRect();
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight;

  // высота панели — как она реально отрисовалась на этом экране
  root.style.setProperty('--navh', Math.round(r.height) + 'px');
  // зазор от низа экрана до панели (включая домашнюю полоску)
  root.style.setProperty('--navgap', Math.max(0, Math.round(window.innerHeight - r.bottom)) + 'px');
  // видимая высота: при открытой клавиатуре она меньше экрана
  root.style.setProperty('--vh', Math.round(vh) + 'px');

  const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  root.style.setProperty('--kb', kb + 'px');
  root.classList.toggle('kb-open', kb > 90);
}
function measureSoon(){ clearTimeout(_mz); _mz = setTimeout(measure, 60); }

if(window.ResizeObserver) new ResizeObserver(measureSoon).observe(document.body);
if(window.visualViewport){
  visualViewport.addEventListener('resize', measure);
  visualViewport.addEventListener('scroll', measure);
}
window.addEventListener('orientationchange', ()=>setTimeout(measure,220));
window.addEventListener('resize', measureSoon);
window.addEventListener('pageshow', measureSoon);
document.addEventListener('focusin', measureSoon);
document.addEventListener('focusout', ()=>setTimeout(measure,120));

/* ============================ СТАРТ ============================ */
async function startApp(){
  void loadCurriculum();
  const raw = await store.get(KEY);
  if(raw){ try{ S = Object.assign(fresh(), JSON.parse(raw)); }catch(e){} }
  await window.cloudInit();
  render();
  measure();
  if(window.ResizeObserver) new ResizeObserver(measureSoon).observe($('nav'));
  setTimeout(measure, 300);
  if('serviceWorker' in navigator && location.protocol==='https:'){
    const had = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(had && !reloading){ reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
  }
}
