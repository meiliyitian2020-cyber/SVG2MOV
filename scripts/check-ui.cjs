'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.run=async({win})=>{
 const wc=win.webContents,root=path.resolve(__dirname,'..');
 const base=path.resolve(process.env.UI_TEST_OUTPUT||path.join(root,'.smoke-output','ui'));
 fs.mkdirSync(base,{recursive:true});const js=code=>wc.executeJavaScript(code);
 async function until(code,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await js(code))return;await delay(40);}throw Error('UI check timed out: '+label);}
 const ready=()=>until("document.body.dataset.ready==='true'",'initialization');
 await ready();
 assert.equal(await js('document.title'),'SVGA 转 MOV');
 const initial=await js("({fps:document.getElementById('fpsMode').value,compression:document.getElementById('compressionMode').value,loops:document.getElementById('loopsMode').value,padding:document.getElementById('padding').value,expanded:document.getElementById('settings').open})");
 assert.deepEqual(initial,{fps:'source',compression:'standard',loops:'1',padding:'200',expanded:false});
 async function viewport(width,height){win.setContentSize(width,height);wc.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width,height},viewPosition:{x:0,y:0},deviceScaleFactor:1,viewSize:{width,height},scale:1});await delay(120);}
 async function fits(label){
  const bounds=await js("({height:innerHeight,width:innerWidth,scroll:document.documentElement.scrollHeight,footer:document.querySelector('footer').getBoundingClientRect().bottom,toolbar:document.querySelector('.queue-toolbar').getBoundingClientRect().bottom,pick:document.getElementById('pick').getBoundingClientRect().right,body:document.body.getBoundingClientRect().bottom})");
  assert.ok(bounds.footer<=bounds.height+1,label+': footer is clipped '+JSON.stringify(bounds));
  assert.ok(bounds.toolbar<=bounds.height+1,label+': queue controls are clipped');
  assert.ok(bounds.scroll<=bounds.height+1,label+': initial view requires scrolling');
  assert.ok(bounds.pick<=bounds.width,label+': select-file button is clipped');
 }
 for(const [width,height] of [[840,620],[680,500],[620,420]]){
  await viewport(width,height);await fits(width+'x'+height);
  if(width===840)fs.writeFileSync(path.join(base,'01-home.png'),(await wc.capturePage()).toPNG());
  await js("document.getElementById('settings').open=true");await delay(60);await fits('expanded settings '+width+'x'+height);
  await js("document.getElementById('settings').open=false");
 }
 await viewport(840,620);
 await js("document.getElementById('settings').open=true;document.getElementById('compressionMode').value='custom';document.getElementById('compression').value='3';document.getElementById('compression').dispatchEvent(new Event('change'))");
 await until("api.getSettings().then(s=>s.compression===3)",'custom PNG setting');
 await new Promise(resolve=>{wc.once('did-finish-load',resolve);wc.reload();});await ready();
 assert.equal(await js("document.getElementById('compressionMode').value"),'custom');
 assert.equal(await js("document.getElementById('compression').value"),'3');
 await js("document.getElementById('fpsMode').value='custom';document.getElementById('fps').value='24';document.getElementById('fps').dispatchEvent(new Event('change'))");
 await until("api.getSettings().then(s=>s.fps===24)",'custom frame rate');
 await js("document.getElementById('restore').click()");await until("api.getSettings().then(s=>s.fps===0&&s.compression===6&&s.loops===1&&s.padding===200)",'restore defaults');
 assert.equal(await js("document.getElementById('fpsCustom').hidden"),true);
 assert.equal(await js("document.getElementById('compressionCustom').hidden"),true);
 await js("document.getElementById('settings').open=true");await delay(100);fs.writeFileSync(path.join(base,'02-settings.png'),(await wc.capturePage()).toPNG());
 await js("document.getElementById('settings').open=false");
 const out=path.join(base,'exports'),fixture=path.join(root,'tests','fixture-expansion.svga');fs.mkdirSync(out,{recursive:true});
 await js(`api.saveSettings({scale:1,fps:0,codec:'png',compression:6,loops:1,padding:200,outputDir:${JSON.stringify(out)}})`);
 await js("window.qaEvents=[];api.onEvent(d=>window.qaEvents.push(d));document.getElementById('pick').focus()");
 await js(`api.add([${JSON.stringify(fixture)}])`);
 await until("window.qaEvents.some(d=>d.type==='idle'&&d.outputs.length===1)",'batch completion',30000);
 const completed=await js("window.qaEvents.find(d=>d.type==='done').output");assert.ok(fs.statSync(completed).size>0);
 const outputHash=crypto.createHash('sha256').update(fs.readFileSync(completed)).digest('hex');
 assert.equal(await js("document.getElementById('toast').hidden"),false);
 assert.equal(await js("document.getElementById('toastPath').textContent"),completed);
 assert.equal(await js("document.activeElement.id"),'pick','Completion must not steal focus');
 fs.writeFileSync(path.join(base,'03-complete.png'),(await wc.capturePage()).toPNG());
 await js("document.getElementById('toast').dispatchEvent(new MouseEvent('mouseenter'))");await delay(6200);
 assert.equal(await js("document.getElementById('toast').hidden"),false,'Hover should pause dismissal');
 await js("document.getElementById('toast').dispatchEvent(new MouseEvent('mouseleave'))");
 await until("document.getElementById('toast').hidden",'automatic toast dismissal',6500);
 await js("document.getElementById('clear').click()");await until("document.querySelectorAll('.item').length===0",'clear completed queue');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(completed)).digest('hex'),outputHash,'Clearing must not change output');
 const pending=[];for(let n=0;n<12;n++){const file=path.join(base,'queued-'+n+'.svga');fs.copyFileSync(fixture,file);pending.push(file);}
 await js("window.qaEvents=[]");
 await js(`api.saveSettings({scale:1,fps:0,codec:'png',compression:6,loops:20,padding:200,outputDir:${JSON.stringify(out)}})`);
 await js(`api.add(${JSON.stringify(pending)})`);
 await until("document.querySelectorAll('.item').length===12&&document.querySelector('.item[data-state=working]')",'active queue');
 assert.equal(await js("document.getElementById('queue').scrollHeight>document.getElementById('queue').clientHeight"),true,'Only queue should scroll');await fits('queue overflow');
 await js("document.getElementById('clear').click()");
 await until("window.qaEvents.some(d=>d.type==='cleared')",'clear pending queue');
 assert.equal(await js("document.querySelectorAll('.item').length"),1,'Active task must remain');
 await until("window.qaEvents.some(d=>d.type==='idle'&&d.outputs.length===1)",'active task survives clear',60000);
 assert.equal(await js("window.qaEvents.filter(d=>d.type==='done').length"),1,'Waiting tasks must be removed');
 for(const file of pending)assert.deepEqual(fs.readFileSync(file),fs.readFileSync(fixture),'Source file must remain unchanged');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(completed)).digest('hex'),outputHash);
 console.log('UI_CHECK_PASS: 3 window sizes; advanced settings; PNG persistence; original FPS; completion toast + hover + auto-dismiss; clear queue preserves active work and all files.');
};
