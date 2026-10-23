'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,screen}=require('electron');
const fs=require('fs'),fsp=fs.promises,path=require('path'),os=require('os'),{spawn}=require('child_process');
const core=require('./core'),audioEngine=require('./audio');
let win,active=null,queue=[],draining=false,config={...core.defaults},allowed=new Set();
app.setName('SVGA 转 MOV');
app.setPath('userData',path.join(app.getPath('appData'),'SVGA-MOV-Exporter'));
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

async function drain(){
 if(draining)return;draining=true;const outputs=[];let failed=0,cancelled=0;
 try{while(queue.length){
  const item=queue.shift();emit({type:'start',input:item.input});
  try{const result=await convert(item.input,item.s,d=>emit({...d,input:item.input}));outputs.push(result.output);emit({type:'done',input:item.input,output:result.output});}
  catch(e){const wasCancelled=e.message==='已取消';if(wasCancelled)cancelled++;else failed++;emit({type:'error',input:item.input,message:e.message,cancelled:wasCancelled});}
 }}finally{draining=false;emit({type:'idle',outputs,failed,cancelled});}
}
async function loadSettings(){
 const candidates=[configPath()];
 if(!process.env.SVGA_TEST_SETTINGS)for(const name of ['SVGA MOV Exporter','svga-mov-exporter'])candidates.push(path.join(app.getPath('appData'),name,'settings.json'));
 for(const candidate of candidates){try{return core.settings(JSON.parse(await fsp.readFile(candidate,'utf8')));}catch{}}
 return {...core.defaults};
}
app.whenReady().then(async()=>{
 if(selftest){try{const input=process.argv[process.argv.indexOf('--self-test')+1];const result=await convert(input,{...core.defaults,...JSON.parse(process.env.TEST_OPTIONS||'{}'),outputDir:process.env.TEST_OUTPUT||''},d=>console.log(JSON.stringify(d)));console.log('TEST_RESULT '+JSON.stringify(result));app.exit(0);}catch(e){console.error(e);app.exit(1);}return;}
 config=await loadSettings();
 const area=screen.getPrimaryDisplay().workAreaSize;
 const width=Math.max(620,Math.min(840,area.width-48)),height=Math.max(420,Math.min(620,area.height-96));
 win=new BrowserWindow({useContentSize:true,width,height,minWidth:620,minHeight:420,title:'SVGA 转 MOV',icon:path.join(__dirname,'assets','icon.png'),backgroundColor:'#f5f7f7',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 ipcMain.handle('get-settings',()=>config);
 ipcMain.handle('save-settings',async(_,s)=>{config=core.settings(s);await fsp.mkdir(path.dirname(configPath()),{recursive:true});await fsp.writeFile(configPath(),JSON.stringify(config,null,2));return config;});
 ipcMain.handle('pick',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'SVGA 动画',extensions:['svga']}]});return r.canceled?[]:r.filePaths;});
 ipcMain.handle('folder',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});return r.canceled?'':r.filePaths[0];});
 ipcMain.handle('add',async(_,files)=>{
  if(!Array.isArray(files))throw Error('文件列表无效');const valid=[];let unreadable=0;
  for(const file of files){
   if(typeof file!=='string'||path.extname(file).toLowerCase()!=='.svga')continue;
   if(active?.input===file||queue.some(x=>x.input===file)||valid.includes(file))continue;
   try{if((await fsp.stat(file)).isFile())valid.push(file);}catch{unreadable++;}
  }
  for(const input of valid)queue.push({input,s:{...config}});
  emit({type:'queued',files:valid});if(unreadable)emit({type:'notice',message:unreadable+' 个文件无法读取，请检查文件位置。'});
  if(valid.length)setImmediate(drain);return valid.length;
 });
 ipcMain.handle('cancel',()=>{const inputs=queue.map(x=>x.input);queue=[];if(active){active.cancelled=true;active.child?.kill();}emit({type:'cancelled',inputs});});
 // Only discard in-memory entries. Never unlink source files or completed output.
 ipcMain.handle('clear-queue',()=>{queue=[];const activeInput=active?.input||null;emit({type:'cleared',activeInput});return {activeInput};});
 ipcMain.handle('reveal',(_,p)=>{if(allowed.has(p))shell.showItemInFolder(p);});
 await win.loadFile(path.join(__dirname,'index.html'));
 if(!app.isPackaged&&process.argv.includes('--ui-check')){
  try{await require('../scripts/check-ui.cjs').run({win,app});app.exit(0);}catch(e){console.error(e);app.exit(1);}return;
 }
 const cliFiles=process.argv.filter(f=>/\.svga$/i.test(f));if(cliFiles.length)win.webContents.send('update',{type:'cli',files:cliFiles});
 win.on('close',e=>{if(active||queue.length){const n=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续导出','退出并取消'],defaultId:0,cancelId:0,message:'导出仍在进行，是否退出？'});if(n===0){e.preventDefault();return;}queue=[];if(active){active.cancelled=true;active.child?.kill();}}});
});
app.on('window-all-closed',()=>{if(!selftest)app.quit();});
