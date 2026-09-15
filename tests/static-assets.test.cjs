const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..');

test('index links the external stylesheet and ships no inline style block',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/rel="stylesheet" href="styles\.css\?v=/);
  assert.ok(fs.existsSync(path.join(root,'styles.css')),'styles.css существует');
  assert.ok(!/<style>/.test(html),'нет встроенного блока стилей');
});

test('stylesheet and api transport are published, served and cached offline',async t=>{
  const files=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
  for(const f of ['styles.css','api-transport.js'])assert.ok(files.includes(f),f+' в site-files.json');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(sw,/styles\.css\?v=/,'styles.css в офлайн-оболочке SW');

  const port=18790;
  const child=spawn(process.execPath,[path.join(root,'server.js')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore'});
  try{
    let up=false;
    for(let i=0;i<50&&!up;i++){
      await new Promise(r=>setTimeout(r,100));
      up=await fetch(`http://127.0.0.1:${port}/api/health`).then(r=>r.ok).catch(()=>false);
    }
    assert.ok(up,'локальный сервер запустился');
    const css=await fetch(`http://127.0.0.1:${port}/styles.css`);
    assert.equal(css.status,200);
    assert.match(css.headers.get('content-type')||'',/text\/css/);
    const transport=await fetch(`http://127.0.0.1:${port}/api-transport.js`);
    assert.equal(transport.status,200);
    assert.match(transport.headers.get('content-type')||'',/javascript/);
  }finally{child.kill();}
});
