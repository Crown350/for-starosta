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
const KINDS = ["лекция","практика","лаба","семинар","Лекции","Практические занятия","Лабораторные работы","Электронные лекции"];
const DOW = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];

function fresh(){
  return {
    v:1,
    group:'',
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
      group:'', week:'odd', importedAt:''
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
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
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
  clearTimeout(_t); _t=setTimeout(()=>t.classList.remove('show'),2400); }
let _sv;
function save(){ if(window.cloudSave) window.cloudSave(); else {clearTimeout(_sv); _sv=setTimeout(()=>store.set(KEY, JSON.stringify(S)),120);} }
function copy(txt, msg){
  const ok=()=>toast(msg||'Скопировано');
  if(navigator.clipboard) navigator.clipboard.writeText(txt).then(ok,()=>askText('Скопируй вручную:',txt));
  else askText('Скопируй вручную:',txt);
}

/* ============================ ИКОНКИ ============================ */
const ICONS={
  edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19.3 8.9a2.1 2.1 0 0 0-3-3L5.2 17 4 20z"/><path d="M14.5 7.5l2 2"/></svg>',
  trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M7 7l1 12.2A1.8 1.8 0 0 0 9.8 21h4.4A1.8 1.8 0 0 0 16 19.2L17 7"/></svg>'
};
const icon=n=>ICONS[n]||'';
let scheduleLoading=false;

/* ============================ РОЛИ И НАВИГАЦИЯ ============================ */
const isEditor=()=>!!(window.cloudCanEdit&&window.cloudCanEdit());
const NAV_SVGS={
  pairs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9.5 4h5v2.6h-5z"/><path d="M9 12.5h6M9 16.5h3.5"/></svg>',
  schedule:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4.5" width="16" height="15.5" rx="3"/><path d="M4 9.5h16M10 9.5V20"/></svg>',
  semester:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.3 12 5l8.5 4.3L12 13.6 3.5 9.3z"/><path d="M7 11.5v3.6c0 1.5 2.2 2.9 5 2.9s5-1.4 5-2.9v-3.6"/></svg>',
  works:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M8.4 12.3l2.5 2.5 4.7-5.2"/></svg>',
  money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6.4" width="18" height="11.2" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6.4 12h.01M17.6 12h.01"/></svg>',
  group:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9.2" cy="9" r="3.2"/><path d="M3.6 19.2c.6-3.3 2.9-5 5.6-5s5 1.7 5.6 5"/><path d="M15.8 6.8a3.2 3.2 0 010 5.4M17.4 14.6c1.9.7 3 2.3 3.4 4.4"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h8M4 15.5h3.5"/><path d="M16.5 8.5H20M11.5 15.5H20"/><circle cx="14.2" cy="8.5" r="2.2"/><circle cx="9.2" cy="15.5" r="2.2"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg>'
};
const NAV_TABS={
  reader:[
    {id:'pairs',label:'Сегодня',icon:NAV_SVGS.pairs},
    {id:'schedule',label:'Расписание',icon:NAV_SVGS.schedule},
    {id:'semester',label:'Семестр',icon:NAV_SVGS.semester,when:()=>typeof curriculum!=='undefined'&&curriculum.length},
    {id:'more',label:'Ещё',icon:NAV_SVGS.more},
  ],
  editor:[
    {id:'pairs',label:'Сегодня',icon:NAV_SVGS.pairs},
    {id:'works',label:'Сдачи',icon:NAV_SVGS.works},
    {id:'money',label:'Деньги',icon:NAV_SVGS.money},
    {id:'group',label:'Группа',icon:NAV_SVGS.group},
    {id:'more',label:'Ещё',icon:NAV_SVGS.more},
  ],
};
let navSig='';
function renderNav(){
  const nav=$('nav'); if(!nav)return;
  const role=isEditor()?'editor':'reader';
  const tabs=NAV_TABS[role].filter(t=>!t.when||t.when());
  const sig=role+':'+tabs.map(t=>t.id).join(',');
  if(sig!==navSig){
    navSig=sig;
    nav.innerHTML=tabs.map(t=>`<button type="button" data-tab="${t.id}"><i>${t.icon}</i>${t.label}</button>`).join('');
  }
  const activeId=tabs.some(t=>t.id===tab)?tab:(tab==='semester'?'more':'pairs');
  nav.querySelectorAll('button').forEach(b=>{
    const on=b.dataset.tab===activeId;
    b.classList.toggle('on',on);
    if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
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
  if(tab==='semester'&&!(typeof curriculum!=='undefined'&&curriculum.length))tab='pairs';
  renderNav();
  const app=$('app');
  const screen=(view==='bgtu'||(view==null&&tab==='schedule'))?'bgtu':(view||tab);
  if(document.body.dataset.screen!==screen)document.body.dataset.screen=screen;
  if(view==='att') return app.innerHTML = viewAtt();
  if(view==='work') return app.innerHTML = viewWork();
  if(view==='fund') return app.innerHTML = viewFund();
  if(view==='student') return app.innerHTML = viewStudent();
  if(view==='import') return app.innerHTML = viewImport();
  if(view==='dir') return app.innerHTML = viewDir();
  if(view==='tpl') return app.innerHTML = viewTpl();
  if(view==='bgtu') return app.innerHTML = viewBGTU();
  if(tab==='schedule') return app.innerHTML = viewBGTU();
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

/* ---------- СЕГОДНЯ ---------- */
function viewPairs(){
  ensureBGTULessonsForDate(curDate);
  const ls = lessonsOn(curDate);
  const d = dowOf(curDate);
  const editable = window.cloudCanEdit?.();
  let h = head('Сегодня', `${DOW[d]} · БГТУ: ${bgtuWeekLabel(bgtuCurrentWeekForDate(curDate))} неделя`) + `
    <div class="row date-row">
      <button class="iconbtn" data-act="dshift" data-v="-1" aria-label="Предыдущий день">‹</button>
      <input type="date" id="curDate" value="${esc(curDate)}" aria-label="Дата">
      <button class="iconbtn" data-act="dshift" data-v="1" aria-label="Следующий день">›</button>
      <button class="btn ghost" data-act="today">Сегодня</button>
    </div></header>`;

  if(S.schedule?.lastError) h += `<p class="card state-error" role="alert"><b>Расписание не обновилось</b>${esc(S.schedule.lastError)} Показаны сохранённые занятия.</p>`;
  if(!ls.length){
    h += scheduleLoading
      ? `<div class="empty"><span class="schedule-spinner" aria-hidden="true"></span> Загружаю расписание…</div>`
      : `<div class="empty">На этот день пар нет.<br>Выбери другую дату или проверь расписание в разделе «Ещё».</div>`;
  } else {
    let nMiss=0,uMiss=0;
    ls.forEach(l=>{ Object.values(S.att[l.id]||{}).forEach(v=>{ if(v==='n')nMiss++; else if(v==='u')uMiss++; }); });
    const heroRight = editable
      ? `<div><small>Не пришли</small><strong>${nMiss+uMiss}</strong><span>${nMiss} Н · ${uMiss} У</span></div>`
      : `<div><strong>${DOW[d][0].toUpperCase()+DOW[d].slice(1)}</strong><span>${bgtuWeekLabel(bgtuCurrentWeekForDate(curDate))} неделя</span></div>`;
    h += `<div class="hero"><div><strong>${plural(ls.length,'пара','пары','пар')}</strong></div>${heroRight}</div>`;
    h += `<div class="section-title"><span>${editable?'Нажми на пару, чтобы отметить':'Расписание дня'}</span><b>${esc(fmtDate(curDate))}</b></div><ul class="grouplist">`;
    ls.forEach(l=>{
      const a = S.att[l.id]||{};
      let ln=0,lu=0; Object.values(a).forEach(v=>{ if(v==='n')ln++; else if(v==='u')lu++; });
      const main = `
        <span class="pairno" aria-hidden="true">${l.time?esc(l.time):'№'+l.pair}</span>
        <span class="t"><b>${esc(subjName(l.subjectId))}</b>
          <span>${esc(l.kind||'')}${lessonLocation(l)?' · '+lessonLocation(l):''}${l.teacherId?' · '+esc(formatTeacherName(teachName(l.teacherId))):''}</span></span>`;
      if(editable){
        h += `<li>
          <button class="lesson" type="button" data-act="openatt" data-id="${l.id}">
            ${main}
            <span class="chips-inline">${ln?`<span class="chip bad">${ln} Н</span>`:''}${lu?`<span class="chip warn">${lu} У</span>`:''}${!ln&&!lu?`<span class="chip ok">все</span>`:''}</span>
          </button>
          <span class="rowacts">
            <button class="iconbtn" data-act="editlesson" data-id="${l.id}" aria-label="Изменить пару ${esc(subjName(l.subjectId))}">${icon('edit')}</button>
            <button class="iconbtn" data-act="dellesson" data-id="${l.id}" aria-label="Удалить пару ${esc(subjName(l.subjectId))}">${icon('trash')}</button>
          </span>
        </li>`;
      } else {
        h += `<li>${main}</li>`;
      }
    });
    h += `</ul>`;
  }
  if(editable){
    h += `<div class="row">
      <button class="btn ghost grow" data-act="addlesson">+ Пара</button>
      <button class="btn ghost grow" data-act="fromtpl">Из шаблона недели</button>
    </div>
    ${ls.length?`<div class="row"><button class="btn wide" data-act="daysum">Отчёт за день в буфер</button></div>`:''}`;
  } else {
    h += `<div class="loginrow"><span>Ты староста группы?</span><button class="linkbtn" data-act="cloudlogin">Войти по ключу →</button></div>`;
  }
  return h;
}
function viewAtt(){
  const l = S.lessons.find(x=>x.id===ctx.lesson);
  if(!l){ view=null; return viewPairs(); }
  const a = attOf(l.id);
  let n=0,u=0; Object.values(a).forEach(v=>{ if(v==='n')n++; else if(v==='u')u++; });
  const tot=S.students.length||1, was=S.students.length-n-u;
  let h = head(subjName(l.subjectId), `${esc(fmtDate(l.date))} · ${l.pair} пара · ${esc(l.kind||'')}${l.room?' · ауд. '+esc(l.room):''} <button class="back" data-act="editlesson" data-id="${l.id}">изменить</button>`, 1) + `
    <div class="bar">
      <div class="bartrack">
        <div class="barfill" style="width:${was/tot*100}%"></div>
        <div class="barfill warn" style="width:${u/tot*100}%"></div>
        <div class="barfill bad" style="width:${n/tot*100}%"></div>
      </div>
      <div class="stats"><span>Были <b>${was}</b></span><span>Н <b>${n}</b></span><span>У <b>${u}</b></span></div>
    </div></header>
    <p class="hint">По умолчанию все на паре. Отмечай только тех, кого нет: Н — прогул, У — по уважительной.</p><ul class="grouplist">`;
  S.students.forEach((s,i)=>{
    const v = a[s.id];
    h += `<li class="${v==='n'?'no':v==='u'?'exc':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}</span>
        <span class="marks">
          <button class="mark n" data-act="mark" data-v="n" aria-pressed="${v==='n'}" aria-label="${esc(initials(s.fio))}: прогул">Н</button>
          <button class="mark u" data-act="mark" data-v="u" aria-pressed="${v==='u'}" aria-label="${esc(initials(s.fio))}: уважительная">У</button>
        </span>
      </div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost grow" data-act="clearatt">Снять отметки</button>
      <button class="btn grow" data-act="attreport">Отчёт в буфер</button>
    </div>`;
  return h;
}

/* ---------- СДАЧИ ---------- */
function viewWorks(){
  let h = head('Сдачи и дедлайны') + `</header>`;
  if(!S.works.length) h += `<div class="empty">Работ пока нет.<br>Добавь лабу, РГР или контрольную — и отмечай, кто сдал.</div>`;
  const today = todayISO();
  const sorted = S.works.slice().sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1);
  h += `<ul class="grouplist">`;
  sorted.forEach(w=>{
    const m = S.subs[w.id]||{};
    let y=0; S.students.forEach(s=>{ if((m[s.id]||{}).s==='y') y++; });
    const late = w.due && w.due < today;
    h += `<li>
      <button class="lesson" type="button" data-act="openwork" data-id="${w.id}">
        <span class="t"><b>${esc(w.name)}</b><span>${esc(subjName(w.subjectId))}${w.due?' · до '+fmtDate(w.due):''}</span></span>
        <span class="chip ${y===S.students.length?'ok':late?'bad':''}">${y}/${S.students.length}</span>
        <span class="go" aria-hidden="true">›</span>
      </button>
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
    <div class="row"><input type="search" id="q" placeholder="Фамилия" aria-label="Поиск по фамилии" value="${esc(ctx.q||'')}"></div>
    </header><ul class="grouplist">`;
  const q = norm(ctx.q||'');
  S.students.forEach((s,i)=>{
    if(q && !norm(s.fio).includes(q)) return;
    const c = m[s.id]||{s:null,mark:'',note:''};
    h += `<li class="${c.s==='y'?'yes':c.s==='n'?'no':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}${c.note||c.mark?`<small>${esc([c.mark,c.note].filter(Boolean).join(' · '))}</small>`:''}</span>
        <span class="marks">
          <button class="mark y" data-act="smark" data-v="y" aria-pressed="${c.s==='y'}" aria-label="${esc(initials(s.fio))}: сдал">✓</button>
          <button class="mark n" data-act="smark" data-v="n" aria-pressed="${c.s==='n'}" aria-label="${esc(initials(s.fio))}: не сдал">✕</button>
        </span>
      </div>
      <button class="notebtn" data-act="opennote">${c.note||c.mark?'изменить оценку / заметку':'оценка / заметка'}</button>
      <div class="noteline"><input type="text" data-act="note" value="${esc([c.mark,c.note].filter(Boolean).join(' · '))}"
        placeholder="оценка, дата, комментарий" aria-label="Оценка и заметка для ${esc(initials(s.fio))}"></div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost grow" data-act="delwork">Удалить работу</button>
      <button class="btn grow" data-act="workreport">Отчёт в буфер</button>
    </div>`;
  return h;
}

/* ---------- ДЕНЬГИ ---------- */
function viewMoney(){
  let h = head('Сборы') + `</header>`;
  if(!S.funds.length) h += `<div class="empty">Сборов нет.<br>Создай сбор — например, на ремонт кабинета — и отмечай, кто скинулся.</div>`;
  h += `<ul class="grouplist">`;
  S.funds.forEach(f=>{
    const p = S.pays[f.id]||{};
    let got=0, cnt=0;
    S.students.forEach(s=>{ const v=p[s.id]||0; got+=v; if(v>=(f.per||0) && (f.per||0)>0) cnt++; });
    const goal = (f.per||0)*S.students.length;
    h += `<li>
      <button class="lesson" type="button" data-act="openfund" data-id="${f.id}">
        <span class="t"><b>${esc(f.name)}</b><span>по ${f.per||0} ₽ с человека</span></span>
        <span class="chip ${cnt===S.students.length?'ok':''}">${cnt}/${S.students.length}</span>
        <span class="go" aria-hidden="true">›</span>
      </button>
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
    </header><p class="hint">Тап по кнопке — сдал полностью. Долго держать не нужно: частичную сумму впиши в поле.</p><ul class="grouplist">`;
  S.students.forEach((s,i)=>{
    const v = p[s.id]||0;
    const full = (f.per||0)>0 && v>=(f.per||0);
    h += `<li class="${full?'yes':v>0?'exc':''}" data-id="${s.id}">
      <div class="top">
        <span class="num">${i+1}</span>
        <span class="fio">${esc(s.fio)}${v&&!full?`<small>частично: ${v} ₽</small>`:''}</span>
        <span class="marks">
          <button class="mark y" data-act="pay" aria-pressed="${full}" aria-label="${esc(initials(s.fio))}: оплатил полностью">₽</button>
        </span>
      </div>
      <button class="notebtn" data-act="opennote">${v?'изменить сумму':'частичная сумма'}</button>
      <div class="noteline"><input type="number" inputmode="numeric" data-act="paysum" value="${v||''}" placeholder="сколько сдал" aria-label="Сумма для ${esc(initials(s.fio))}, ₽" min="0"></div>
    </li>`;
  });
  h += `</ul><div class="row">
      <button class="btn ghost grow" data-act="delfund">Удалить сбор</button>
      <button class="btn grow" data-act="fundreport">Кто должен — в буфер</button>
    </div>`;
  return h;
}

/* ---------- ГРУППА ---------- */
function viewGroup(){
  const order = S.students;
  const dutyNow = order.length ? order[S.duty.idx % order.length] : null;
  let h = head('Группа', plural(S.students.length,'человек','человека','человек')) + `
    <div class="row"><input type="search" id="gq" placeholder="Фамилия" aria-label="Поиск по фамилии" value="${esc(ctx.gq||'')}"></div>
    </header>
    ${!S.students.length?`<div class="empty">Группы пока нет.<br>Отсканируй список в разделе «Ещё» или добавь людей вручную.</div>`:''}
    <div class="card" ${!S.students.length?'hidden':''}>
      <div class="top"><span class="fio"><b>Дежурит: ${dutyNow?esc(initials(dutyNow.fio)):'—'}</b>
        <small>следующий — ${order.length?esc(initials(order[(S.duty.idx+1)%order.length].fio)):'—'}</small></span>
        <button class="btn ghost" data-act="dutynext">Отдежурил</button></div>
    </div><ul class="grouplist">`;
  const q = norm(ctx.gq||'');
  S.students.forEach((s,i)=>{
    if(q && !norm(s.fio).includes(q)) return;
    const {n,u} = missCount(s.id);
    const dw = debtWorks(s.id).length;
    const fd = fundDebt(s.id);
    h += `<li data-id="${s.id}">
      <button class="lesson" type="button" data-act="openstud" data-id="${s.id}">
        <span class="num">${i+1}</span>
        <span class="t"><b>${esc(s.fio)}</b><span>${esc(s.phone||s.tg||'контактов нет')}</span></span>
        <span class="go" aria-hidden="true">›</span>
      </button>
      <div class="chips">
        <span class="chip ${n>=S.limit?'bad':''}">${n} Н</span>
        <span class="chip ${u?'warn':''}">${u} У</span>
        <span class="chip ${dw?'bad':'ok'}">${dw?plural(dw,'долг','долга','долгов'):'всё сдано'}</span>
        ${fd?`<span class="chip bad">${fd} ₽</span>`:''}
      </div>
    </li>`;
  });
  h += `</ul><div class="row">
    <button class="btn ghost grow" data-act="addstud">+ Человек</button>
    <button class="btn ghost grow" data-act="risk">Кто под угрозой</button></div>`;
  return h;
}
function viewStudent(){
  const s = stud(ctx.stud);
  if(!s){ view=null; return viewGroup(); }
  const {n,u} = missCount(s.id);
  let h = head(s.fio, `${n} прогулов · ${u} по уважительной`, 1) + `</header>
    <div class="card">
      <div class="row"><input type="tel" data-act="fphone" value="${esc(s.phone)}" placeholder="+7 900 000-00-00" aria-label="Телефон ${esc(initials(s.fio))}" autocomplete="off"></div>
      <div class="row"><input type="text" data-act="ftg" value="${esc(s.tg)}" placeholder="@username" aria-label="Телеграм ${esc(initials(s.fio))}" autocomplete="off"></div>
      <div class="row"><input type="text" data-act="fnote" value="${esc(s.note)}" placeholder="подгруппа, староста, что угодно" aria-label="Заметка о ${esc(initials(s.fio))}"></div>
    </div>
    <h2>Пропуски по предметам</h2><ul class="grouplist">`;
  S.subjects.forEach(p=>{
    const c = missCount(s.id, p.id);
    if(!c.n && !c.u) return;
    h += `<li><div class="top"><span class="fio">${esc(p.name)}</span>
      <span class="chip ${c.n>=S.limit?'bad':''}">${c.n} Н</span>
      ${c.u?`<span class="chip warn">${c.u} У</span>`:''}</div></li>`;
  });
  if(!n && !u) h += `<div class="empty">Пропусков нет.</div>`;
  h += `</ul><h2>Несданные работы</h2><ul class="grouplist">`;
  const dw = debtWorks(s.id);
  if(!dw.length) h += `<div class="empty">Всё сдано.</div>`;
  dw.forEach(w=>{ h += `<li><div class="top"><span class="fio">${esc(w.name)}<small>${esc(subjName(w.subjectId))}${w.due?' · до '+fmtDate(w.due):''}</small></span></div></li>`; });
  h += `</ul><h2>Деньги</h2><ul class="grouplist">`;
  let any=false;
  S.funds.forEach(f=>{
    const paid=(S.pays[f.id]||{})[s.id]||0; const per=f.per||0;
    if(paid>=per && per>0) return; any=true;
    h += `<li><div class="top"><span class="fio">${esc(f.name)}</span>
      <span class="chip bad">${per-paid} ₽</span></div></li>`;
  });
  if(!any) h += `<div class="empty">Долгов нет.</div>`;
  h += `</ul><div class="row">
    <button class="btn ghost grow" data-act="msgstud">Сводка в буфер</button>
    <button class="btn danger grow" data-act="delstud">Удалить</button></div>`;
  return h;
}

/* ---------- ЕЩЁ ---------- */
async function loadCurriculum(){
  try{
    const response=await fetch('../data/curriculum.json',{cache:'no-store'});
    if(!response.ok || response.status===204)return;
    const rows=await response.json();
    if(!Array.isArray(rows)||!rows.length||!rows.every(r=>r&&typeof r.name==='string'&&typeof r.code==='string'&&['Экзамен','Зачёт','ЗачётСОценкой'].includes(r.control)&&[null,'КП','КР'].includes(r.extra)&&['lek','lab','pr','ze'].every(k=>Number.isFinite(r[k])&&r[k]>=0)))return;
    curriculum=rows;const st=$('semester-tab');if(st)st.hidden=false;measureSoon();
  }catch{} // Optional static data: no unhandled errors, tab remains hidden.
}
function viewSemester(){
  const n=control=>curriculum.filter(r=>r.control===control).length;
  let h=head('Семестр','1 курс · '+S.schedule.semester+' семестр · '+S.group)+'</header>';
  h+='<div class="card semester-summary"><span>'+plural(n('Экзамен'),'экзамен','экзамена','экзаменов')+'</span><span>'+plural(n('Зачёт')+n('ЗачётСОценкой'),'зачёт','зачёта','зачётов')+'</span><span>'+curriculum.filter(r=>r.extra).length+' курсовых</span><span>'+curriculum.reduce((s,r)=>s+r.ze,0)+' з.е.</span></div><p class="hint">По дисциплинам, подтверждённым расписанием. Часы: лекции / лабораторные / практические.</p><ul class="grouplist">';
  for(const r of curriculum)h+='<li><div><div class="grp">'+esc(r.code)+' · '+r.ze+' з.е.</div><div class="fio"><b>'+esc(r.name)+'</b></div><div class="chips"><span class="chip '+(r.control==='Экзамен'?'semester-exam':r.control==='ЗачётСОценкой'?'warn':'ok')+'">'+(r.control==='ЗачётСОценкой'?'Зачёт с оценкой':esc(r.control))+'</span>'+(r.extra?'<span class="chip warn">'+esc(r.extra)+'</span>':'')+'</div><p class="hint">Лек: '+r.lek+' · Лаб: '+r.lab+' · Пр: '+r.pr+' ч.<br>Кафедра '+esc(r.kafedra)+'</p></div></li>';
  return h+'</ul>';
}
function viewMore(){
  const hasSemester=typeof curriculum!=='undefined'&&curriculum.length;
  const guest=!window.cloudHasSession?.();
  const editor=window.cloudCanEdit?.();
  return head('Ещё') + `</header>
    <ul class="grouplist">
      ${guest?`<li><button class="lesson" type="button" data-act="cloudlogin"><span class="t"><b>Войти как староста</b>
        <span>ключ доступа открывает журнал группы</span></span><span class="go" aria-hidden="true">›</span></button></li>`:''}
      <li><button class="lesson" type="button" data-act="goimport"><span class="t"><b>Сканировать и импортировать</b>
        <span>списки людей, преподавателей, предметов, отметки из журнала</span></span><span class="go" aria-hidden="true">›</span></button></li>
      <li><button class="lesson" type="button" data-act="godir" data-v="subjects"><span class="t"><b>Предметы</b>
        <span>${S.subjects.length} шт.</span></span><span class="go" aria-hidden="true">›</span></button></li>
      <li><button class="lesson" type="button" data-act="godir" data-v="teachers"><span class="t"><b>Преподаватели</b>
        <span>${S.teachers.length} шт.</span></span><span class="go" aria-hidden="true">›</span></button></li>
      <li><button class="lesson" type="button" data-act="gotpl"><span class="t"><b>Шаблон недели</b>
        <span>${S.tpl.length} пар в шаблоне</span></span><span class="go" aria-hidden="true">›</span></button></li>
      ${editor?`<li><button class="lesson" type="button" data-act="gobgtu"><span class="t"><b>Расписание БГТУ</b>
        <span>${esc((S.schedule&&S.schedule.group)||S.group||'Группа')} · ${(S.schedule&&S.schedule.week==='even')?'чётная':'нечётная'} неделя</span></span><span class="go" aria-hidden="true">›</span></button></li>`:''}
      ${(editor||!hasSemester)?`<li><button class="lesson" type="button" data-act="gosemester"><span class="t"><b>Семестр</b>
        <span>учебный план: предметы, контроль, часы</span></span><span class="go" aria-hidden="true">›</span></button></li>`:''}
    </ul>
    ${window.cloudHasSession?.()?`<h2>Выгрузка</h2>
    <div class="row">
      <button class="btn ghost grow" data-act="csvatt">Посещаемость в CSV</button>
      <button class="btn ghost grow" data-act="csvworks">Сдачи в CSV</button>
    </div>
    <h2>Резервная копия</h2>
    <div class="row">
      <button class="btn ghost grow" data-act="backup">Сохранить файл</button>
      <button class="btn ghost grow" data-act="restore">Загрузить файл</button>
    </div>
    <h2>Настройки</h2>
    <div class="card">
      <div class="field"><label for="limit-input">Порог пропусков</label>
      <input type="number" inputmode="numeric" id="limit-input" data-act="limit" value="${S.limit}" min="1" max="50" aria-describedby="limit-hint"></div>
      <p class="hint" id="limit-hint">Сколько прогулов по предмету, чтобы подсветить человека красным.</p>
    </div>
    `:''}
      <p class="hint">Журнал хранится в облаке. Копия на устройстве сохраняется только с твоего согласия и удаляется при выходе.</p>
    <p class="hint">Версия ${APP_V}</p>
    <button class="btn ghost wide" type="button" data-whats-new>Что нового</button>
    <h2>Интерфейс</h2>
    <p class="hint">Сейчас включён новый режим</p>
    <a class="btn ghost wide ui-mode-link" data-ui-mode="old" href="../">Переключиться на старый режим</a>
    <div class="end-spacer" aria-hidden="true"></div>`;
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
function bgtuWeekGenitive(w){ return w==='even'?'чётной':'нечётной'; }
function bgtuTpls(week){
  /* Номер пары и день приходят из источника строками и в произвольном порядке,
     поэтому приводим их к числам и отбрасываем мусор: иначе сравнение с === ничего не найдёт. */
  return (S.tpl||[])
    .filter(t=>t&&t.source==='bgtu'&&(t.week||'odd')===week)
    .map(t=>({...t,dow:Math.round(+t.dow),pair:Math.round(+t.pair)}))
    .filter(t=>t.dow>=1&&t.dow<=7&&t.pair>=1);
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

  if(typeof data.group==='string'&&data.group.trim())S.group=S.schedule.group=data.group.trim();

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
  async function load(url,viaSupabase=false){
    const ac=new AbortController();const timer=viaSupabase?null:setTimeout(()=>ac.abort(),20000);
    try{
      const options={cache:'no-store',headers:{Accept:'application/json'},signal:ac.signal};
      const res=await (viaSupabase?window.starostaSupabaseFetch(url,options):fetch(url,options));
      const data=await res.json();
      if(!res.ok||!data?.ok||!Array.isArray(data.lessons)||!data.lessons.length||!Number.isFinite(Date.parse(data.fetchedAt)))throw new Error('Invalid schedule');
      return data;
    }finally{clearTimeout(timer);}
  }
  let data;
  scheduleLoading=true;
  try{
    if(window.STAROSTA_SUPABASE_URL){
      try{data=await load('/functions/v1/fetch-schedule',true);}
      catch{data=await load('../schedule.json');}
    }else data=await load('../schedule.json');
    if(S!==targetState||window.cloudScheduleBlocked?.())return;
    if(Date.parse(data.fetchedAt)<Date.parse(S.schedule?.fetchedAt||''))return;
    const same=data.contentHash?data.contentHash===S.schedule?.contentHash:data.fetchedAt===S.schedule?.fetchedAt;
    if(typeof data.group==='string'&&data.group.trim())S.group=S.schedule.group=data.group.trim();
    if(!same)applyBGTUSchedule(data);
    S.schedule.fetchedAt=data.fetchedAt;
    S.schedule.lastSyncAt=new Date(data.fetchedAt).toLocaleString('ru-RU');
    S.schedule.contentHash=data.contentHash||null;
    S.schedule.lastError='';
    save();
  }catch{
    // Offline/missing fallback never overwrites existing lessons or shows a toast.
  }finally{
    scheduleLoading=false;
    if(S===targetState)render();
  }
}

async function refreshBGTU(){
  if(window.cloudScheduleBlocked?.())return toast('Обновление публичного расписания недоступно для этой сессии');
  if(ctx.bgtuBusy)return;
  const targetState=S;
  ctx.bgtuBusy=true;ctx.bgtuMessage='';ctx.bgtuFailed=false;render();
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),65000);
  try{
    if(!window.STAROSTA_YANDEX_FUNCTION_URL)throw new Error('Адрес функции расписания не настроен.');
    const res=await fetch(window.STAROSTA_YANDEX_FUNCTION_URL,{cache:'no-store',headers:{Accept:'application/json'},signal:ac.signal});
    let data;try{data=await res.json();}catch{throw new Error('Сервис расписания вернул некорректный ответ.');}
    if(!res.ok||!data.ok)throw new Error(data.error||data.errorMessage||`Сервис расписания недоступен (${res.status}).`);
    if(!Array.isArray(data.lessons)||data.lessons.length<10||!Number.isFinite(Date.parse(data.fetchedAt)))throw new Error('Получен неполный снимок расписания. Старые данные сохранены.');
    if(S!==targetState||window.cloudScheduleBlocked?.())return;
    if(!(Date.parse(data.fetchedAt)<Date.parse(S.schedule?.fetchedAt||''))){
      if(!data.contentHash||data.contentHash!==S.schedule?.contentHash)applyBGTUSchedule(data);
      S.schedule.fetchedAt=data.fetchedAt;S.schedule.contentHash=data.contentHash||null;
      S.schedule.lastSyncAt=new Date(data.fetchedAt).toLocaleString('ru-RU');S.schedule.lastError='';save();
    }
    ctx.bgtuMessage=data.cached?'Проверено недавно, попробуй через минуту':data.changed?'Расписание изменилось':'Обновлено только что';
  }catch(error){
    if(S!==targetState)return;
    ctx.bgtuFailed=true;
    ctx.bgtuMessage=error.name==='AbortError'?'Ответ не получен за 65 секунд. Проверка на сервере может продолжаться. Попробуй позже.':error instanceof TypeError?'Не удалось связаться с Yandex. Проверь интернет и доступность функции.':error.message;
  }finally{clearTimeout(timer);ctx.bgtuBusy=false;render();}
}

function viewBGTU(){
  const m=S.schedule||{};
  const editable=window.cloudCanEdit?.();
  const hasData=bgtuTpls('odd').length||bgtuTpls('even').length;
  const asView=typeof view!=='undefined'&&view==='bgtu';
  const week=bgtuCurrentWeekForDate(todayISO());
    let h=head('Расписание','официальное расписание БГТУ',asView?1:undefined)+`</header>`;
  h+=`<div class="card">
    <div class="fio"><b>${esc(m.group||S.group||'Группа')}</b></div>
    <p class="bgtu-source">${esc(m.profile||'Системы искусственного интеллекта и обработка больших данных')} · ${esc(m.code||'09.03.02')} · ${esc(m.form||'Очное')}</p>
    <div class="bgtu-meta">
      <span class="chip">${esc(m.year||'2026-2027')}</span>
      <span class="chip">${m.semester||1} семестр</span>
      <span class="chip">${esc(m.education||'бакалавр')}</span>
    </div>
    ${editable?`
    <button class="btn wide" data-act="syncbgtu" ${ctx.bgtuBusy?'disabled aria-busy="true"':''}>${ctx.bgtuBusy?'<span class="schedule-spinner" aria-hidden="true"></span> Обновляю…':'Обновить расписание'}</button>
    ${ctx.bgtuMessage?`<p class="bgtu-source ${ctx.bgtuFailed?'schedule-error':''}" role="status">${esc(ctx.bgtuMessage)}</p>`:''}`:''}
    <p class="bgtu-source ${m.fetchedAt&&Date.now()-Date.parse(m.fetchedAt)>21600000?'schedule-stale':''}">Обновлено: ${m.fetchedAt?esc(new Date(m.fetchedAt).toLocaleString('ru-RU')):'нет снимка'}</p>
    ${m.fetchedAt&&Date.now()-Date.parse(m.fetchedAt)>21600000?'<p class="hint schedule-stale" role="status">Снимок старше 6 часов. Возможны изменения в расписании.</p>':''}
  </div>`;
  if(editable)h+=`<div class="card"><p class="hint">Параметры зафиксированы: ФИТ · бакалавр · 09.03.02 · «Системы искусственного интеллекта и обработка больших данных» · очная · ${esc(m.group||S.group||'Группа')}. Расписание загружается из официального источника. Дата получения указана выше. Нечётная и чётная недели хранятся отдельно.</p></div>`;
  if(hasData)h+=bgtuWeekTable(week);
  h+=`<div class="row"><button class="btn ghost wide" data-act="openbgtu">Открыть официальный сайт БГТУ</button></div>`;
  return h;
}

/* ---------- НЕДЕЛЯ: таблица «пара × день», обе недели сразу ---------- */
function bgtuSlot(time){
  const m=String(time||'').match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if(m) return {s:+m[1]*60+ +m[2], e:+m[3]*60+ +m[4]};
  const s=String(time||'').match(/(\d{1,2}):(\d{2})/);
  return s? {s:+s[1]*60+ +s[2], e:+s[1]*60+ +s[2]+95} : {s:0,e:0};
}
function bgtuHm(min){ return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }
const BGTU_DOW_S=['пн','вт','ср','чт','пт','сб','вс'];
const BGTU_SHORT={
  'основы российской государственности':'ОРГ',
  'физическая культура и спорт. общая физическая подготовка':'Физкультура',
  'физическая культура и спорт':'Физкультура',
  'технологии личностно-профессионального развития':'Технологии ЛПР'
};
function bgtuShortName(id){
  const name=String(subjName(id)||'').trim().replace(/\s*\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
  const known=BGTU_SHORT[name.toLowerCase()];
  if(known)return known;
  if(name.length<=44)return name;
  const cut=name.slice(0,44);
  return cut.slice(0,cut.lastIndexOf(' ')>24?cut.lastIndexOf(' '):44).trim()+'…';
}
function bgtuTeacherShort(id){
  if(!id)return '';
  const fio=String(formatTeacherName(teachName(id))||'').trim();
  if(!fio||/^ваканси/i.test(fio))return '';
  return fio.split(/\s+/)[0];
}
const BGTU_KIND={'лекции':'лекция','практические занятия':'практика','лабораторные работы':'лабораторная',
  'электронные лекции':'эл. лекция','лекция':'лекция','практика':'практика','лаба':'лабораторная',
  'лабораторная':'лабораторная','семинар':'семинар'};
function bgtuKindLabel(kind){
  const k=String(kind||'').trim().toLowerCase();
  return BGTU_KIND[k]||(/^[а-яё]{3,12}$/i.test(k)?k:'');
}
const atPair=(list,dow,pair)=>list.find(t=>t.dow===dow&&t.pair===pair)||null;
/* Совпадают ли две записи полностью — тогда клетка не делится пополам. */
function bgtuSameLesson(a,b){
  return !!a&&!!b&&a.subjectId===b.subjectId&&a.pair===b.pair
    &&String(a.time||'')===String(b.time||'')&&String(a.kind||'')===String(b.kind||'')
    &&String(a.room||'')===String(b.room||'')&&String(a.teacherId||'')===String(b.teacherId||'');
}
/* Состояние половинки клетки для одной недели: занятие, окно между её парами или свободно.
   Окно — разрыв между парами этой же недели: нужна пара и выше, и ниже. */
function bgtuHalfState(list,dow,pair,maxPair,has){
  const row=atPair(list,dow,pair);
  if(row)return{kind:'class',row};
  let prev=0,next=0;
  for(let p=pair-1;p>=1;p--)if(has(list,dow,p)){prev=p;break;}
  for(let p=pair+1;p<=maxPair;p++)if(has(list,dow,p)){next=p;break;}
  if(!prev||!next)return{kind:'free'};
  const from=bgtuSlot(atPair(list,dow,prev).time).e;
  const to=bgtuSlot(atPair(list,dow,next).time).s;
  if(to<=from)return{kind:'free'};
  return{kind:'win',from,to,first:pair===prev+1};
}
function bgtuHalf(part,compact,cur){
  const tag=part.tag;
  /* Половинка той недели, которая сейчас не идёт, помечается off - её приглушают. */
  const off=(tag==='both'||tag===cur)?'':' off';
  if(part.kind==='win'){
    return `<div class="we win${tag==='even'?' alt':''}${off}"><span>окно</span>`
      +`<b>${bgtuHm(part.from)}–${bgtuHm(part.to)}</b></div>`;
  }
  const row=part.row;
  const who=compact?'':' · '+bgtuTeacherShort(row.teacherId);
  const kind=bgtuKindLabel(row.kind);
  return `<div class="we${tag==='both'?' both':(tag==='even'?' alt':'')}${off}">`
    +`<b>${esc(bgtuShortName(row.subjectId))}</b>`
    +`<small class="meta">${kind?`<span class="k">${esc(kind)}</span>`:''}`
    +(row.room?`<span class="r">${esc(row.room)}</span>`:'')+(who?`<span class="t2">${esc(who)}</span>`:'')+`</small>`
    +`</div>`;
}
function bgtuWeekTable(week){
  const odd=bgtuTpls('odd'), even=bgtuTpls('even');
  const has=(list,dow,pair)=>!!atPair(list,dow,pair);
  const all=[...odd,...even];
  /* Столбцы — только те дни, в которые есть хоть одна пара, и всегда по порядку:
     ни количество, ни порядок записей в данных на таблицу не влияют. */
  const cols=[...new Set(all.map(t=>t.dow))].sort((a,b)=>a-b);
  const days=cols.length?cols:[1,2,3,4,5,6];
  const maxPair=all.reduce((m,t)=>Math.max(m,t.pair),0);
  /* Время строки — самое раннее среди всех записей этого номера пары. */
  const slotByPair={};
  all.forEach(t=>{
    if(!t.time)return;
    const slot=bgtuSlot(t.time),cur=slotByPair[t.pair];
    if(!cur||slot.s<cur.s)slotByPair[t.pair]=slot;
  });
  const todayDow=dowOf(todayISO());

  /* Строки таблицы: настоящие пары и одна свёрнутая строка на пропуск номеров.
     Схлопывается любая непрерывная серия номеров без занятий — хоть 5–7, хоть одна 4-я. */
  const rows=[];
  let skipped=[];
  for(let p=1;p<=maxPair;p++){
    if(days.some(d=>has(odd,d,p)||has(even,d,p))){
      if(skipped.length){rows.push({skipped});skipped=[];}
      rows.push({pair:p});
    }else skipped.push(p);
  }
  if(skipped.length)rows.push({skipped});
  if(!rows.some(r=>r.pair))return '<p class="hint">В расписании нет ни одной пары.</p>';

  let h=`<h2>Обе недели: сейчас ${bgtuWeekLabel(week)}</h2>`
    +'<div class="bwside"><ul class="legend">'
    +`<li><span class="lg w${week==='odd'?' cur':''}">н</span>нечётная неделя — половинка сверху</li>`
    +`<li><span class="lg c${week==='even'?' cur':''}">ч</span>чётная неделя — половинка снизу</li>`
    +'<li><span class="lg gap"></span>окно между парами этой недели</li>'
    +'</ul></div>'
    +`<div class="bwscroll"><table class="bw" style="--bwcols:${days.length}"><caption class="sr-only">Расписание на нечётную и чётную недели: строки — номера пар, столбцы — дни недели</caption>`
    +'<thead><tr><th class="pcol dhead"><span class="dh-day">день</span><span class="dh-pair">пара</span></th>';
  for(const dow of days){
    const isToday=dow===todayDow;
    /* Считаем номера пар, а не записи: дубль одной пары не должен завышать счётчик. */
    const n=list=>new Set(list.filter(t=>t.dow===dow).map(t=>t.pair)).size;
    h+=`<th scope="col" class="${isToday?'today':''}"><b>${BGTU_DOW_S[dow-1].toUpperCase()}</b>`
      +`<small>${isToday?'сегодня':n(odd)+'/'+n(even)+' н/ч'}</small></th>`;
  }
  h+='</tr></thead><tbody>';

  let prevOcc=null;
  rows.forEach((row,ri)=>{
    if(row.skipped){
      const list=row.skipped;
      const label=list.length>1?list[0]+'–'+list[list.length-1]:String(list[0]);
      h+=`<tr class="gaprow"><th class="pcol" scope="row">${label}</th>`
        +`<td colspan="${days.length}">пар нет</td></tr>`;
      prevOcc=null;
      return;
    }
    const occ=days.map(d=>has(odd,d,row.pair)||has(even,d,row.pair));
    const slot=slotByPair[row.pair];
    /* Строка прямо над свёрнутым блоком отдаёт ему свою нижнюю границу. */
    const pre=rows[ri+1]&&rows[ri+1].skipped;
    h+=`<tr${pre?' class="pre"':''}><th class="pcol" scope="row"><b>${row.pair}</b>`
      +(slot?`<small>${bgtuHm(slot.s)}</small>`:'')+`</th>`;
    days.forEach((dow,di)=>{
      const o=bgtuHalfState(odd,dow,row.pair,maxPair,has);
      const e=bgtuHalfState(even,dow,row.pair,maxPair,has);
      let parts=[];
      if(o.kind==='class'&&e.kind==='class'&&bgtuSameLesson(o.row,e.row)){
        parts=[{tag:'both',kind:'class',row:o.row}];
      }else{
        if(o.kind==='class')parts.push({tag:'odd',kind:'class',row:o.row});
        else if(o.kind==='win'&&o.first)parts.push({tag:'odd',kind:'win',from:o.from,to:o.to});
        if(e.kind==='class')parts.push({tag:'even',kind:'class',row:e.row});
        else if(e.kind==='win'&&e.first)parts.push({tag:'even',kind:'win',from:e.from,to:e.to});
      }
      /* Сетка идёт только по занятым ячейкам. Справа и снизу линию рисует сама ячейка,
         а слева и сверху - только там, где соседняя ячейка пустая: иначе граница
         занятой области остаётся незамкнутой. */
      const cls=[];
      if(dow===todayDow)cls.push('today');
      if(!parts.length)cls.push('gap');
      else{
        if(di>0&&!occ[di-1])cls.push('el');
        if(prevOcc&&!prevOcc[di])cls.push('et');
      }
      h+=`<td class="${cls.join(' ')}"><div class="wc">`
        +parts.map(p=>bgtuHalf(p,parts.length===1,week)).join('')
        +`</div></td>`;
    });
    prevOcc=occ;
    h+='</tr>';
  });
  h+=`</tbody></table></div>`
    +'<p class="hint">Строки — пары со временем, столбцы — дни. На телефоне таблица прокручивается вбок, колонка с номером пары остаётся на месте.</p>';
  return h;
}


let teacherDirectory={};
function formatTeacherName(value){
  const name=String(value||'').trim().replace(/\s+/g,' ');
  const match=name.match(/^(\S+)\s+(.+)$/);
  if(!match)return name;
  const parts=match[2].match(/[А-ЯЁA-Z][а-яёa-z]*/giu);
  return parts?.length?match[1]+' '+parts.map(part=>part[0].toUpperCase()+'.').join(''):name;
}
const teacherKey=name=>String(name||'').replace(/\s+/g,'').toLowerCase();
let teachersLoadPromise;
function loadTeachers(){
  if(teachersLoadPromise)return teachersLoadPromise;
  teachersLoadPromise=(async()=>{
    const university=window.STAROSTA_UNIVERSITY||'bgtu';
    const cacheKey='starosta.public-teachers.v1:'+university;
    const valid=rows=>Array.isArray(rows)&&rows.every(row=>row&&['short_name','full_name','url'].every(key=>typeof row[key]==='string'));
    const apply=rows=>{
      teacherDirectory=Object.fromEntries(rows.map(row=>[teacherKey(row.short_name),{full:row.full_name,url:row.url}]));
      render();
    };
    try{
      const cached=JSON.parse(localStorage.getItem(cacheKey));
      if(cached&&valid(cached.rows)){
        apply(cached.rows);
        if(Date.now()-cached.at>=0&&Date.now()-cached.at<24*60*60*1000)return;
      }
    }catch{} // Storage can be unavailable; continue with the network.
    try{
      const path='/rest/v1/teachers?select=short_name,full_name,url&university=eq.'+encodeURIComponent(university);
      const res=await window.starostaSupabaseFetch(path,{headers:{apikey:window.STAROSTA_SUPABASE_KEY}});
      if(!res.ok)return;
      const rows=await res.json();
      if(!valid(rows))return;
      apply(rows);
      try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),rows}));}catch{}
    }catch{} // Keep the last public directory when offline.
  })();
  return teachersLoadPromise;
}
function teacherDetails(name){
  const info=teacherDirectory[teacherKey(name)];
  if(!info)return '';
  return '<small>'+esc(info.full)+'</small><small><a href="'+esc(info.url)+'" target="_blank" rel="noopener noreferrer">Страница БГТУ ↗</a></small>';
}
function subjectTeachers(subjectId){
  const teachers=new Map();
  for(const row of S.tpl||[]){
    if(row.subjectId!==subjectId||!row.teacherId)continue;
    const name=teachName(row.teacherId);if(!name)continue;
    if(!teachers.has(name))teachers.set(name,new Set());
    if(row.kind)teachers.get(name).add(row.kind);
  }
  return [...teachers].map(([name,kinds])=>'<small>'+esc(formatTeacherName(name))+(kinds.size?' — '+esc([...kinds].join(', ')):'')+'</small>').join('');
}
function lessonLocation(lesson){
  if(/^Физическая культура/i.test(subjName(lesson.subjectId)))return '<a href="https://yandex.ru/maps/org/dom_sporta_bgtu/16992735690/" target="_blank" rel="noopener noreferrer">Дом спорта БГТУ ↗</a>';
  const room=String(lesson.room||'').trim();
  const building=room==='ауд.Д'?3:/^\d{2}$/.test(room)?1:/^[АA]\d{3}$/i.test(room)?3:/^[БB]\d{3}$/i.test(room)?4:/^\d{3}$/.test(room)?2:null;
  const maps={1:'CTt2u8jQ',2:'CTt2uLzr',3:'CTt2uTpr',4:'CTt2u-zk'};
  return esc(room)+(building?' · <a href="https://yandex.ru/maps/-/'+maps[building]+'" target="_blank" rel="noopener noreferrer">'+building+' корпус ↗</a>':'');
}

function viewDir(){
  const isT = ctx.dir==='teachers';
  const items = isT ? S.teachers : S.subjects;
  let h = head(isT?'Преподаватели':'Предметы', '', 1) + `</header><ul class="grouplist">`;
  if(!items.length) h += `<div class="empty">Пусто. Добавь вручную или отсканируй список.</div>`;
  items.forEach((it,i)=>{
    h += `<li data-id="${it.id}"><div class="top">
      <span class="num">${i+1}</span>
      <span class="fio">${esc(isT?formatTeacherName(it.fio):it.name)}<small>${esc(isT?(it.dept||''):(it.control||''))}</small>${isT?teacherDetails(it.fio):subjectTeachers(it.id)}</span>
      <span class="rowacts">
      <button class="iconbtn" data-act="editdir" data-id="${it.id}" aria-label="Изменить: ${esc(isT?formatTeacherName(it.fio):it.name)}">${icon('edit')}</button>
      <button class="iconbtn" data-act="deldir" data-id="${it.id}" aria-label="Удалить: ${esc(isT?formatTeacherName(it.fio):it.name)}">${icon('trash')}</button>
      </span>
    </div></li>`;
  });
  h += `</ul><div class="row"><button class="btn wide" data-act="adddir">+ Добавить</button></div>`;
  return h;
}
function viewTpl(){
  let h = head('Шаблон недели', 'постоянное расписание', 1) + `</header>`;
  if(!S.tpl.length) h += `<div class="empty">Шаблон пуст. Забей сюда расписание один раз —<br>и дни будут заполняться в один тап.</div>`;
  [1,2,3,4,5,6].forEach(d=>{
    const rows = S.tpl.filter(t=>t.dow===d).sort((a,b)=>a.pair-b.pair);
    if(!rows.length) return;
    h += `<h2>${DOW[d]}</h2><ul class="grouplist">`;
    rows.forEach(t=>{
      h += `<li><div class="top"><span class="pairno">${t.pair}</span>
        <span class="fio">${esc(subjName(t.subjectId))}<small>${esc(t.kind||'')}${t.room?' · ауд. '+esc(t.room):''}</small></span>
        <button class="iconbtn" data-act="deltpl" data-id="${t.id}" aria-label="Убрать из шаблона: ${esc(subjName(t.subjectId))}">${icon('trash')}</button></div></li>`;
    });
    h += `</ul>`;
  });
  h += `<div class="row"><button class="btn wide" data-act="addtpl">+ Пара в шаблон</button></div>`;
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
    <div class="field"><label for="imode">Что импортируем</label><select id="imode">
      ${Object.entries(IMPORT_MODES).map(([k,v])=>`<option value="${k}"${k===mode?' selected':''}>${v.t}</option>`).join('')}
    </select></div></header>
    <p class="hint">Самый точный способ на айфоне: открой «Камеру», наведи на лист, нажми значок «Живого текста» в углу кадра, выдели и скопируй — потом вставь сюда. Распознаёт система, офлайн и по-русски.</p>
    <div class="row"><textarea id="raw" placeholder="Вставь сюда текст со скана" aria-label="Текст со скана">${esc(ctx.raw||'')}</textarea></div>
    <div class="row">
      <button class="btn ghost grow" data-act="ocr">Распознать фото в приложении</button>
      <button class="btn grow" data-act="parse">Разобрать</button>
    </div>
    <div id="ocrbox"></div>
    <p class="hint">${m.hint}</p>`;

  if(ctx.rows && ctx.rows.length){
    h += `<h2>Проверь перед импортом</h2><div class="card"><table class="prev">`;
    ctx.rows.forEach((r,i)=>{
      h += `<tr>
        <td class="st"><button class="iconbtn" data-act="togglerow" data-i="${i}">${r.on?'✓':'·'}</button></td>
        <td>${esc(r.text)}${r.match?`<br><small>→ ${esc(r.match.fio)}${r.status?' · '+({n:'Н — прогул',u:'У — уважительная',ok:'был на паре'}[r.status]||''):''}</small>`
            :r.needMatch?`<br><small class="bad-text">не нашёл такого в группе</small>`:''}</td>
      </tr>`;
    });
    h += `</table></div><div class="row"><button class="btn wide" data-act="doimport">Импортировать ${ctx.rows.filter(r=>r.on).length}</button></div>`;
  }
  if(ctx.imode==='marks'){
    const ls=lessonsOn(curDate);
    h += `<div class="card"><div class="field field-plain">
      <label for="import-lesson">Куда поставить отметки</label>
      ${ls.length?`<select id="import-lesson" data-act="importlesson">
        ${ls.map(l=>`<option value="${l.id}"${ctx.importLesson===l.id?' selected':''}>${l.pair} пара · ${esc(subjName(l.subjectId))}${l.time?' · '+esc(l.time):''}</option>`).join('')}
      </select>`:`<p class="hint hint-plain">На ${esc(fmtDate(curDate))} пар нет — сначала добавь пару во вкладке «Сегодня».</p>`}
    </div></div>`;
    if(!ctx.importLesson && ls.length) ctx.importLesson=ls[0].id;
  }
  return h + `<div class="end-spacer" aria-hidden="true"></div>`;
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
    const l = ls.find(x=>x.id===ctx.importLesson) || ls[0];
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
          s.src=new URL('../vendor/ocr/tesseract.min.js',document.baseURI).href;
          s.onload=res; s.onerror=()=>rej(new Error('нет сети'));
          document.head.appendChild(s);
        });
      }
      const assetBase=new URL('../vendor/ocr/',document.baseURI).href;
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
  if(e.target.closest('a[href]'))return;
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
      if(!S.subjects.length) return toast('Сначала добавь предметы в разделе «Ещё»');
      const f = await askForm({title:'Новая пара',submit:'Добавить',fields:[
        {name:'subjectId',label:'Предмет',type:'select',options:S.subjects.map(p=>({value:p.id,label:p.name})),required:true},
        {name:'pair',label:'Номер пары',type:'number',value:'1',min:1,max:8,required:true},
        {name:'kind',label:'Тип занятия',type:'select',options:KINDS.map(k=>({value:k,label:k})),value:'практика'},
        {name:'teacherId',label:'Преподаватель',type:'select',options:[{value:'',label:'— не указан —'},...S.teachers.map(t=>({value:t.id,label:formatTeacherName(t.fio)}))]},
        {name:'room',label:'Аудитория',type:'text',placeholder:'например, А213'},
        {name:'date',label:'Дата',type:'date',value:curDate,required:true},
      ]});
      if(!f) return;
      S.lessons.push({id:uid('l'),date:f.date,pair:+f.pair,subjectId:f.subjectId,kind:f.kind||'',room:f.room.trim(),teacherId:f.teacherId||''});
      if(f.date!==curDate){ curDate=f.date; }
      save(); break; }
    case 'editlesson': {
      const l = S.lessons.find(x=>x.id===btn.dataset.id);
      if(!l) return;
      if(!S.subjects.length) return toast('Сначала добавь предметы в разделе «Ещё»');
      const f = await askForm({title:'Изменить пару',submit:'Сохранить',fields:[
        {name:'subjectId',label:'Предмет',type:'select',options:S.subjects.map(p=>({value:p.id,label:p.name})),value:l.subjectId,required:true},
        {name:'pair',label:'Номер пары',type:'number',value:String(l.pair),min:1,max:8,required:true},
        {name:'kind',label:'Тип занятия',type:'select',options:[{value:'',label:'— не указан —'},...[...new Set([...KINDS,...(l.kind?[l.kind]:[])])].map(k=>({value:k,label:k}))],value:l.kind||''},
        {name:'teacherId',label:'Преподаватель',type:'select',options:[{value:'',label:'— не указан —'},...S.teachers.map(t=>({value:t.id,label:formatTeacherName(t.fio)}))],value:l.teacherId||''},
        {name:'room',label:'Аудитория',type:'text',value:l.room||'',placeholder:'например, А213'},
        {name:'date',label:'Дата',type:'date',value:l.date,required:true},
      ]});
      if(!f) return;
      l.subjectId=f.subjectId;
      l.pair=+f.pair||l.pair;
      l.kind=f.kind||'';
      l.teacherId=f.teacherId||'';
      l.room=f.room.trim();
      if(f.date!==l.date){ l.date=f.date; if(l.date!==curDate){ curDate=l.date; view=null; } }
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
      if(!S.subjects.length) return toast('Сначала добавь предметы в разделе «Ещё»');
      const f=await askForm({title:'Новая работа',submit:'Добавить',fields:[
        {name:'subjectId',label:'Предмет',type:'select',options:S.subjects.map(p=>({value:p.id,label:p.name})),required:true},
        {name:'name',label:'Название работы',type:'text',value:'Лабораторная 1',required:true},
        {name:'due',label:'Дедлайн',type:'date',hint:'Можно оставить пустым'},
      ]});
      if(!f) return;
      S.works.push({id:uid('w'),subjectId:f.subjectId,name:f.name.trim(),due:f.due||''}); save(); break; }
    case 'delwork': if(await askConfirm('Удалить работу вместе с отметками?')){
      delete S.subs[ctx.work]; S.works=S.works.filter(w=>w.id!==ctx.work); view=null; save(); } break;
    case 'workreport': { const w=S.works.find(x=>x.id===ctx.work); const m=S.subs[w.id]||{};
      const line=s=>{ const c=m[s.id]||{}; return `${c.s==='y'?'+':c.s==='n'?'−':'·'} ${s.fio}`+
        ((c.mark||c.note)?' — '+[c.mark,c.note].filter(Boolean).join(' · '):''); };
      copy(`${S.group} · ${w.name} (${subjName(w.subjectId)})\n`+S.students.map(line).join('\n'),'Отчёт в буфере'); return; }

    case 'openfund': view='fund'; ctx.fund=btn.dataset.id; break;
    case 'pay': { const f=S.funds.find(x=>x.id===ctx.fund); const p=paysOf(f.id);
      p[sid] = (p[sid]||0)>=(f.per||0) ? 0 : (f.per||0); save(); break; }
    case 'addfund': {
      const f=await askForm({title:'Новый сбор',submit:'Создать',fields:[
        {name:'name',label:'На что собираем',type:'text',value:'На нужды группы',required:true},
        {name:'per',label:'Сумма с человека, ₽',type:'number',value:'200',min:1,max:1000000,required:true,inputmode:'numeric'},
      ]});
      if(!f) return;
      S.funds.push({id:uid('f'),name:f.name.trim(),per:+f.per||0}); save(); break; }
    case 'delfund': if(await askConfirm('Удалить сбор?')){ delete S.pays[ctx.fund];
      S.funds=S.funds.filter(f=>f.id!==ctx.fund); view=null; save(); } break;
    case 'fundreport': { const f=S.funds.find(x=>x.id===ctx.fund); const p=S.pays[f.id]||{};
      const debt=S.students.filter(s=>(p[s.id]||0)<(f.per||0));
      copy(`${S.group} · ${f.name} — по ${f.per} ₽\nНе сдали (${debt.length}): `+
        (debt.map(s=>initials(s.fio)+((p[s.id]||0)?` (${p[s.id]})`:'')).join(', ')||'нет'),'Список должников в буфере'); return; }

    case 'openstud': view='student'; ctx.stud=btn.dataset.id; break;
    case 'addstud': { const f=await askForm({title:'Новый человек в группе',submit:'Добавить',fields:[
        {name:'fio',label:'ФИО полностью',type:'text',required:true,autocomplete:'off'},
        {name:'phone',label:'Телефон',type:'tel',placeholder:'+7 900 000-00-00',autocomplete:'off'},
        {name:'tg',label:'Телеграм',type:'text',placeholder:'@username',autocomplete:'off'},
        {name:'note',label:'Заметка',type:'text',placeholder:'подгруппа, староста, что угодно'},
      ]});
      if(!f) return;
      S.students.push({id:uid('s'),fio:f.fio.trim(),phone:f.phone.trim(),tg:f.tg.trim(),note:f.note.trim()});
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
    case 'cloudlogin': { const d=$('cloud-login-dialog'); if(d&&!d.open){ d.showModal(); const k=$('cloud-key'); if(k)k.focus(); } return; }
    case 'syncbgtu': refreshBGTU(); return;
    case 'gobgtu': view='bgtu'; break;
    case 'gosemester': tab='semester'; view=null; ctx={}; break;
    case 'openbgtu': window.open('https://www.tu-bryansk.ru/education/schedule/','_blank','noopener'); return;
    case 'godir': view='dir'; ctx.dir=btn.dataset.v; break;
    case 'gotpl': view='tpl'; break;
    case 'adddir': {
      if(ctx.dir==='teachers'){
        const f=await askForm({title:'Новый преподаватель',submit:'Добавить',fields:[
          {name:'fio',label:'ФИО',type:'text',required:true,placeholder:'Тестова А. О.'},
          {name:'dept',label:'Кафедра или предмет',type:'text',placeholder:'можно пусто'},
        ]});
        if(!f) return;
        S.teachers.push({id:uid('t'),fio:f.fio.trim(),dept:f.dept.trim(),contact:'',note:''});
      } else {
        const f=await askForm({title:'Новый предмет',submit:'Добавить',fields:[
          {name:'name',label:'Название предмета',type:'text',required:true},
          {name:'control',label:'Форма контроля',type:'select',options:[
            {value:'',label:'— не указана —'},{value:'зачёт',label:'Зачёт'},{value:'экзамен',label:'Экзамен'},{value:'дифзачёт',label:'Дифзачёт'}]},
        ]});
        if(!f) return;
        S.subjects.push({id:uid('p'),name:f.name.trim(),control:f.control,teacherId:''});
      }
      save(); break; }
    case 'editdir': { const id=btn.dataset.id;
      if(ctx.dir==='teachers'){ const t=S.teachers.find(x=>x.id===id); if(!t) return;
        const f=await askForm({title:'Изменить преподавателя',submit:'Сохранить',fields:[
          {name:'fio',label:'ФИО',type:'text',value:t.fio,required:true},
          {name:'dept',label:'Кафедра или предмет',type:'text',value:t.dept||''},
        ]});
        if(!f) return;
        t.fio=f.fio.trim(); t.dept=f.dept.trim();
      } else { const p=S.subjects.find(x=>x.id===id); if(!p) return;
        const f=await askForm({title:'Изменить предмет',submit:'Сохранить',fields:[
          {name:'name',label:'Название предмета',type:'text',value:p.name,required:true},
          {name:'control',label:'Форма контроля',type:'select',options:[
            {value:'',label:'— не указана —'},{value:'зачёт',label:'Зачёт'},{value:'экзамен',label:'Экзамен'},{value:'дифзачёт',label:'Дифзачёт'}],value:p.control||''},
        ]});
        if(!f) return;
        p.name=f.name.trim(); p.control=f.control;
      }
      save(); break; }
    case 'deldir': { const id=btn.dataset.id;
      const what=ctx.dir==='teachers'?'преподавателя':'предмет';
      const willCascade=ctx.dir==='teachers'?false:true;
      const note=willCascade?' Занятия и шаблон с этим предметом останутся без предмета.':'';
      if(!await askConfirm('Удалить '+what+'?'+note)) return;
      if(ctx.dir==='teachers') S.teachers=S.teachers.filter(x=>x.id!==id);
      else S.subjects=S.subjects.filter(x=>x.id!==id);
      save(); break; }
    case 'addtpl': {
      if(!S.subjects.length) return toast('Сначала добавь предметы в разделе «Ещё»');
      const f=await askForm({title:'Пара в шаблон недели',submit:'Добавить',fields:[
        {name:'dow',label:'День недели',type:'select',options:[[1,'Понедельник'],[2,'Вторник'],[3,'Среда'],[4,'Четверг'],[5,'Пятница'],[6,'Суббота']].map(([v,l])=>({value:String(v),label:l})),required:true},
        {name:'subjectId',label:'Предмет',type:'select',options:S.subjects.map(p=>({value:p.id,label:p.name})),required:true},
        {name:'pair',label:'Номер пары',type:'number',value:'1',min:1,max:8,required:true},
        {name:'kind',label:'Тип занятия',type:'select',options:[{value:'',label:'— не указан —'},...KINDS.map(k=>({value:k,label:k}))]},
        {name:'room',label:'Аудитория',type:'text',placeholder:'можно пусто'},
      ]});
      if(!f) return;
      S.tpl.push({id:uid('x'),dow:+f.dow,pair:+f.pair,subjectId:f.subjectId,kind:f.kind||'',room:f.room.trim()}); save(); break; }
    case 'deltpl': if(await askConfirm('Удалить эту пару из шаблона недели?')){ S.tpl=S.tpl.filter(t=>t.id!==btn.dataset.id); save(); } break;

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
  if(act==='importlesson'){ ctx.importLesson=t.value; return; }
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
  void loadTeachers();
  const raw = await store.get(KEY);
  if(raw){ try{ S = Object.assign(fresh(), JSON.parse(raw)); }catch(e){} }
  await window.cloudInit();
  render();
  measure();
  window.whatsNewReady?.();
  if(window.ResizeObserver) new ResizeObserver(measureSoon).observe($('nav'));
  setTimeout(measure, 300);
  if('serviceWorker' in navigator && window.isSecureContext){
    const had = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(had && !reloading){ reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
  }
}
