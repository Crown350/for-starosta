const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const fn=source.slice(source.indexOf('function viewMore(){'),source.indexOf('function pairFromTime('));
function render(active){const c=vm.createContext({window:{cloudHasSession:()=>active},head:()=>'',S:{subjects:[],teachers:[],tpl:[],limit:3},esc:String,APP_V:11});vm.runInContext(fn,c);return c.viewMore();}
test('guest More omits private blocks while keeping public directory and footer',()=>{
 const html=render(false);for(const text of ['Выгрузка','Резервная копия','Настройки','data-act="csvatt"','data-act="csvworks"','data-act="backup"','data-act="restore"','data-act="limit"'])assert.ok(!html.includes(text),text);
 for(const text of ['Предметы','Преподаватели','Шаблон недели','Расписание БГТУ','Журнал хранится в облаке','Версия 11'])assert.ok(html.includes(text),text);
});
test('authenticated More retains all controls',()=>{const html=render(true);for(const act of ['csvatt','csvworks','backup','restore','limit'])assert.ok(html.includes('data-act="'+act+'"'));});
