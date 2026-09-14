const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const ctx=vm.createContext({esc:s=>String(s),subjName:id=>id,teachName:id=>id,S:{tpl:[{subjectId:'Языки',teacherId:'Ефремов',kind:'Лабораторные работы'},{subjectId:'Языки',teacherId:'Вдовиченко',kind:'Лекции'},{subjectId:'Языки',teacherId:'Ефремов',kind:'Лабораторные работы'}]}});
vm.runInContext(source.slice(source.indexOf('let teacherDirectory='),source.indexOf('function viewDir()')),ctx);
test('room rules are exact; sport is selected by subject',()=>{
 for(const [room,building] of [['ауд.Д',3],['51',1],['А213',3],['Б404',4],['231',2]]){const result=ctx.lessonLocation({subjectId:'Алгебра',room});assert.ok(result.startsWith(room+' · <a '));assert.ok(result.includes(building+' корпус ↗</a>'));assert.ok(result.includes('target="_blank" rel="noopener noreferrer"'));assert.ok(result.includes('https://yandex.ru/maps/-/'+{1:'CTt2u8jQ',2:'CTt2uLzr',3:'CTt2uTpr',4:'CTt2u-zk'}[building]));}
 for(const room of ['Читальный зал','А51','1234',''])assert.equal(ctx.lessonLocation({subjectId:'Алгебра',room}),room);
 assert.match(ctx.lessonLocation({subjectId:'Физическая культура и спорт',room:'Б105'}),/target="_blank".*Дом спорта БГТУ/);
});
test('subject teachers preserve kind and deduplicate repeated weeks',()=>{
 const result=ctx.subjectTeachers('Языки');
 assert.equal(result,'<small>Ефремов — Лабораторные работы</small><small>Вдовиченко — Лекции</small>');
 assert.equal(ctx.teacherDetails('Вакансия . .'),'');
});
