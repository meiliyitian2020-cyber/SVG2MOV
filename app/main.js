'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const fs=require('fs'),fsp=fs.promises,path=require('path'),os=require('os'),{spawn}=require('child_process');
const core=require('./core'),audioEngine=require('./audio');
let win,active=null,queue=[],config={...core.defaults},allowed=new Set();
const selftest=process.argv.includes('--self-test');
if(process.env.SVGA_TEST_SETTINGS)app.setPath('userData',process.env.SVGA_TEST_SETTINGS);
if(process.platform==='linux')app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();
function emit(data){if(win&&!win.isDestroyed())win.webContents.send('update',data);}
function ffmpeg(){return app.isPackaged?path.join(process.resourcesPath,'bin','ffmpeg.exe'):(process.env.SVGA_FFMPEG||path.join(__dirname,'..','bin',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'));}
const configPath=()=>path.join(app.getPath('userData'),'settings.json');
async function convert(input,s,notify=()=>{}){
 const job={cancelled:false,child:null,worker:null,input};active=job;
 let temp,child,closed,audioDir,muxTemp;
 try{
 const bytes=await fsp.readFile(input);if(bytes.length>256*1024*1024)throw Error('文件超过256MB');
 const audio=await audioEngine.extract(bytes);
 const worker=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});job.worker=worker;
 worker.webContents.setWindowOpenHandler(()=>({action:'deny'}));worker.webContents.on('will-navigate',e=>e.preventDefault());
 await worker.loadFile(path.join(__dirname,'render.html'));
 const run=code=>worker.webContents.executeJavaScript(code);
 const meta=await run('loadSVGA('+JSON.stringify(audio.renderBytes.toString('base64'))+')');
 meta.hasAudio=audio.clips.length>0;meta.audioClips=audio.clips.length;
 const p=core.plan(meta,s);if(job.cancelled)throw Error('已取消');await run(`resizeOutput(${p.w},${p.h},${p.padding})`);
 let output=core.outputName(input,s.outputDir);await fsp.mkdir(path.dirname(output),{recursive:true});
 // Reserve final name to prevent concurrent exports or existing files being overwritten.
 const base=output.slice(0,-4);let reserved;
 for(let n=0;n<10000;n++){output=n?base+' ('+n+').mov':base+'.mov';try{reserved=await fsp.open(output,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;}}
 if(!reserved)throw Error('无法创建输出文件');await reserved.close();job.reserved=output;
 temp=path.join(path.dirname(output),'.svga-'+require('crypto').randomUUID()+'.mov');
 child=spawn(ffmpeg(),core.encoderArgs(p,temp),{windowsHide:true,stdio:['pipe','ignore','pipe']});job.child=child;
 let err='',spawnErr=null,streamErr=null;
 child.stderr.on('data',b=>{err=(err+b.toString()).slice(-6000);});child.stdin.on('error',e=>{streamErr=e;});
 closed=new Promise(resolve=>{child.once('error',e=>{spawnErr=e;resolve(-1);});child.once('close',code=>resolve(code));});
 notify({type:'meta',meta,p,output});
 for(let i=0;i<p.frames;i++){
  if(job.cancelled)throw Error('已取消');if(spawnErr)throw spawnErr;if(streamErr)throw Error(err||streamErr.message);
  const frame=await run('renderFrame('+core.frameAt(i,p,meta)+')');
  const buffer=Buffer.from(frame,'base64');
  await new Promise((resolve,reject)=>child.stdin.write(buffer,e=>e?reject(Error(err||e.message)):resolve()));
  if(i%3===0||i===p.frames-1)notify({type:'progress',value:Math.round((i+1)/p.frames*98)});
 }
 child.stdin.end();const code=await closed;if(job.cancelled)throw Error('已取消');if(code!==0)throw Error(err||spawnErr?.message||'编码器异常退出');
 if(audio.clips.length){
 notify({type:'audio',value:99});
 audioDir=await fsp.mkdtemp(path.join(os.tmpdir(),'svga-audio-'));const paths=new Map();
 for(const [key,data] of audio.assets){const file=path.join(audioDir,'track-'+paths.size+'.bin');await fsp.writeFile(file,data);paths.set(key,file);}
 const cycle=path.join(audioDir,'cycle.wav');
 await runEncoder(job,audioEngine.cycleArgs(audio,paths,meta,p,cycle));
 muxTemp=path.join(path.dirname(output),'.svga-'+require('crypto').randomUUID()+'.mov');
 await runEncoder(job,audioEngine.muxArgs(temp,cycle,p,muxTemp));
 await fsp.rm(temp,{force:true});temp=muxTemp;muxTemp=null;
 }
 if((await fsp.stat(temp)).size<32)throw Error('输出文件为空');
 await fsp.rename(temp,output);job.reserved=null;allowed.add(output);return {output,meta,p};
 } finally {
 if(child&&child.exitCode===null){child.kill();if(closed)await closed;}
 if(job.worker&&!job.worker.isDestroyed())job.worker.destroy();
 if(audioDir)await fsp.rm(audioDir,{recursive:true,force:true}).catch(()=>{});
 if(muxTemp)await fsp.rm(muxTemp,{force:true}).catch(()=>{});
 if(temp)await fsp.rm(temp,{force:true}).catch(()=>{});if(job.reserved)await fsp.rm(job.reserved,{force:true}).catch(()=>{});active=null;
 }
}

async function runEncoder(job,args){
 if(job.cancelled)throw Error('已取消');
 let err='';const proc=spawn(ffmpeg(),args,{windowsHide:true,stdio:['ignore','ignore','pipe']});job.child=proc;
 proc.stderr.on('data',b=>{err=(err+b.toString()).slice(-6000);});
 const code=await new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',resolve);});
 if(job.cancelled)throw Error('已取消');if(code!==0)throw Error('音频导出失败：'+(err||code));
}

async function drain(){if(active)return;while(queue.length){const item=queue.shift();emit({type:'start',input:item.input});try{const r=await convert(item.input,item.s,d=>emit({...d,input:item.input}));emit({type:'done',input:item.input,output:r.output});}catch(e){emit({type:'error',input:item.input,message:e.message});}}emit({type:'idle'});}
app.whenReady().then(async()=>{
 if(selftest){try{const input=process.argv[process.argv.indexOf('--self-test')+1];const result=await convert(input,{...core.defaults,...JSON.parse(process.env.TEST_OPTIONS||'{}'),outputDir:process.env.TEST_OUTPUT||''},d=>console.log(JSON.stringify(d)));console.log('TEST_RESULT '+JSON.stringify(result));app.exit(0);}catch(e){console.error(e);app.exit(1);}return;}
 try{config=core.settings(JSON.parse(await fsp.readFile(configPath(),'utf8')));}catch{}
 win=new BrowserWindow({width:960,height:760,minWidth:800,minHeight:620,title:'SVGA 转 MOV',backgroundColor:'#f4f5f7',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 ipcMain.handle('get-settings',()=>config);
 ipcMain.handle('save-settings',async(_,s)=>{config=core.settings(s);await fsp.mkdir(path.dirname(configPath()),{recursive:true});await fsp.writeFile(configPath(),JSON.stringify(config,null,2));return config;});
 ipcMain.handle('pick',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'SVGA 动画',extensions:['svga']}]});return r.canceled?[]:r.filePaths;});
 ipcMain.handle('folder',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});return r.canceled?'':r.filePaths[0];});
 ipcMain.handle('add',async(_,files)=>{if(!Array.isArray(files))throw Error('文件列表无效');const valid=[];for(const f of files){if(typeof f==='string'&&path.extname(f).toLowerCase()==='.svga'&&(await fsp.stat(f)).isFile()){if(active?.input===f||queue.some(x=>x.input===f))continue;valid.push(f);queue.push({input:f,s:{...config}});}}emit({type:'queued',files:valid});setImmediate(drain);return valid.length;});
 ipcMain.handle('cancel',()=>{queue=[];if(active){active.cancelled=true;active.child?.kill();}emit({type:'cancelled'});});
 ipcMain.handle('reveal',(_,p)=>{if(allowed.has(p))shell.showItemInFolder(p);});
 await win.loadFile(path.join(__dirname,'index.html'));
 if(process.env.SVGA_UI_TEST){
 const wc=win.webContents;await wc.executeJavaScript(`new Promise(r=>setTimeout(r,100))`);
 const check=await wc.executeJavaScript(`({scale:document.getElementById('scale').value,fps:document.getElementById('fps').value,codec:document.getElementById('codec').value,padding:document.getElementById('padding').value,bridge:!!window.api})`);
 console.log('UI_DEFAULTS '+JSON.stringify(check));
 await wc.executeJavaScript(`api.onEvent(d=>{if(d.type==='done')console.log('UI_EXPORT_OK '+d.output);if(d.type==='error')console.log('UI_EXPORT_ERROR '+d.message)});api.add([${JSON.stringify(process.env.SVGA_UI_TEST)}])`);
 wc.on('console-message',async(_e,level,msg)=>{if(typeof msg==='string'&&msg.startsWith('UI_EXPORT_OK')){await fsp.writeFile(path.join(__dirname,'..','tests','ui-preview.png'),(await wc.capturePage()).toPNG());console.log(msg);app.exit(0);}if(typeof msg==='string'&&msg.startsWith('UI_EXPORT_ERROR')){console.error(msg);app.exit(1);}});
 setTimeout(()=>app.exit(2),30000);
 }
 const cliFiles=process.argv.filter(f=>/\.svga$/i.test(f));if(cliFiles.length)win.webContents.send('update',{type:'cli',files:cliFiles});
 win.on('close',e=>{if(active||queue.length){const n=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续导出','退出并取消'],defaultId:0,cancelId:0,message:'导出仍在进行，是否退出？'});if(n===0){e.preventDefault();return;}queue=[];if(active){active.cancelled=true;active.child?.kill();}}});
});
app.on('window-all-closed',()=>{if(!selftest)app.quit();});
