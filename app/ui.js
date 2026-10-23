'use strict';
const $=id=>document.getElementById(id);
const defaults={scale:1,fps:0,codec:'png',compression:6,loops:1,padding:200,outputDir:''};
const presets={standard:6,fast:1,small:9};
const rows=new Map();let saving=Promise.resolve(),toastTimeout,toastDeadline=0,toastRemaining=6000,toastOutput='';
function notice(message=''){$('notice').textContent=message;$('notice').hidden=!message;}
function toggleControls(){
 $('fpsCustom').hidden=$('fpsMode').value!=='custom';
 $('compressionCustom').hidden=$('compressionMode').value!=='custom';
 $('loopsCustom').hidden=$('loopsMode').value!=='custom';
 const png=$('codec').value==='png';
 $('compressionMode').disabled=!png;$('compression').disabled=!png;
 const hints={standard:'速度与体积折中，不改变画质。',fast:'压缩较少，导出更快，文件通常更大。',small:'压缩更多，文件通常更小，导出更慢。',custom:'0–9 均无损；数值越大，压缩通常越多。'};
 $('compressionHint').textContent=png?hints[$('compressionMode').value]:'此选项仅用于 PNG 无损编码。';
 $('resetDir').hidden=!$('outputDir').value;
}
function fill(s){
 $('scale').value=s.scale;$('codec').value=s.codec;$('padding').value=s.padding;$('outputDir').value=s.outputDir;
 $('fpsMode').value=Number(s.fps)===0?'source':'custom';$('fps').value=Number(s.fps)||30;
 $('compressionMode').value=Object.keys(presets).find(k=>presets[k]===Number(s.compression))||'custom';$('compression').value=s.compression;
 $('loopsMode').value=[1,2,3,5].includes(Number(s.loops))?String(s.loops):'custom';$('loops').value=s.loops;
 toggleControls();summary(s);
}
function values(){return {scale:Number($('scale').value),fps:$('fpsMode').value==='source'?0:Number($('fps').value),codec:$('codec').value,compression:$('compressionMode').value==='custom'?Number($('compression').value):presets[$('compressionMode').value],loops:$('loopsMode').value==='custom'?Number($('loops').value):Number($('loopsMode').value),padding:Number($('padding').value),outputDir:$('outputDir').value};}
function summary(s){
 const parts=[s.scale===1?'原尺寸':s.scale+' 倍尺寸',s.fps===0?'原帧率':s.fps+' fps',s.codec==='png'?'PNG 无损':'ProRes 4444'];
 if(s.padding)parts.push('四周 +'+s.padding+' px');if(s.loops>1)parts.push('播放 '+s.loops+' 遍');
 $('settingSummary').textContent=parts.join(' · ');
}
function save(){
 toggleControls();const s=values();
 saving=saving.catch(()=>{}).then(()=>api.saveSettings(s));
 saving.then(result=>{notice();summary(result);},e=>notice(e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')));
 return saving;
}
const fields=['scale','fpsMode','fps','codec','compressionMode','compression','loopsMode','loops','padding'];
for(const id of fields)$(id).addEventListener('change',save);
$('restore').onclick=()=>{fill(defaults);save();};
$('folder').onclick=async()=>{const folder=await api.folder();if(folder){$('outputDir').value=folder;save();}};
$('resetDir').onclick=()=>{$('outputDir').value='';save();};
async function add(paths){if(!paths.length)return;try{await save();const n=await api.add(paths);if(!n)notice('这些文件已在等待或导出中。');}catch(e){notice(e.message);}}
$('pick').onclick=async()=>{await add(await api.pick());};
document.addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('over');});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('drop').classList.remove('over');});
document.addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('over');const files=[...e.dataTransfer.files].map(f=>api.pathForFile(f)).filter(p=>/\.svga$/i.test(p));if(files.length)add(files);else notice('请拖入 .svga 文件。');});
$('cancel').onclick=()=>api.cancel();
$('clear').onclick=()=>api.clearQueue();
function refresh(){
 const list=[...rows.values()],busy=list.some(r=>['queued','working'].includes(r.state));
 $('queueCount').textContent=list.length?'('+list.length+')':'';
 $('cancel').disabled=!busy;$('clear').disabled=!list.length;
 $('status').textContent=busy?'正在导出，请稍候':list.length?'已完成 '+list.filter(r=>r.state==='done').length+' / '+list.length+' 个任务':'文件仅在本机处理';
 if(!list.length&&!$('empty')){const empty=document.createElement('div');empty.id='empty';empty.className='empty';empty.textContent='文件加入后，进度会显示在这里';$('queue').append(empty);}
}
function row(input){
 if(rows.has(input))return rows.get(input);
 $('empty')?.remove();const el=document.createElement('div');el.className='item';el.dataset.state='queued';
 const heading=document.createElement('div');heading.className='item-heading';
 const filename=document.createElement('span');filename.className='filename';filename.textContent=input.split(/[\\/]/).pop();filename.title=input;
 const label=document.createElement('span');label.className='state';label.textContent='等待导出';heading.append(filename,label);
 const detail=document.createElement('div');detail.className='detail';detail.textContent=input;detail.title=input;
 const progress=document.createElement('progress');progress.className='progress';progress.max=100;progress.value=0;
 el.append(heading,detail,progress);$('queue').append(el);const result={el,label,detail,progress,state:'queued',output:null};rows.set(input,result);return result;
}
function state(r,value,label){r.state=value;r.el.dataset.state=value;r.label.textContent=label;}
function hideToast(){clearTimeout(toastTimeout);$('toast').hidden=true;toastOutput='';}
function scheduleToast(){toastDeadline=Date.now()+toastRemaining;toastTimeout=setTimeout(hideToast,toastRemaining);}
function showToast(batch){
 if(!batch.outputs.length&&!batch.failed&&!batch.cancelled)return;
 clearTimeout(toastTimeout);toastRemaining=6000;const good=batch.outputs.length;
 $('toastTitle').textContent=good?(batch.failed?'导出完成，部分失败':'导出完成'):(batch.failed?'导出失败':'导出已取消');
 $('toast').dataset.kind=batch.failed&&!good?'error':'success';$('toast').querySelector('.toast-mark').textContent=batch.failed&&!good?'!':'✓';
 $('toastMessage').textContent=good>1?'已导出 '+good+' 个文件'+(batch.failed?'，'+batch.failed+' 个失败':''):(batch.failed||batch.cancelled?'成功 '+good+' · 失败 '+batch.failed+' · 取消 '+batch.cancelled:'');
 toastOutput=good?batch.outputs[good-1]:'';$('toastPath').textContent=toastOutput;$('toastPath').title=toastOutput;$('toastOpen').hidden=!good;
 $('toast').hidden=false;const old=$('toastTimer'),timer=old.cloneNode();old.replaceWith(timer);scheduleToast();
}
$('toast').addEventListener('mouseenter',()=>{clearTimeout(toastTimeout);toastRemaining=Math.max(0,toastDeadline-Date.now());});
$('toast').addEventListener('mouseleave',()=>{if(!$('toast').hidden)scheduleToast();});
$('toastOpen').onclick=()=>{if(toastOutput)api.reveal(toastOutput);};
api.onEvent(d=>{
 if(d.type==='cli'){add(d.files);return;}
 if(d.type==='notice'){notice(d.message);return;}
 if(d.type==='queued'){
  for(const input of d.files){const r=row(input);state(r,'queued','等待导出');r.progress.value=0;r.detail.textContent=input;r.detail.title=input;r.detail.className='detail';r.detail.onclick=null;r.output=null;}refresh();return;
 }
 if(d.type==='cleared'){
  hideToast();for(const [input,r] of rows)if(input!==d.activeInput){r.el.remove();rows.delete(input);}refresh();return;
 }
 if(d.type==='cancelled'){
  for(const input of d.inputs||[]){const r=rows.get(input);if(r){state(r,'cancelled','已取消');r.detail.textContent='未导出，文件未改动';}}refresh();return;
 }
 if(d.type==='idle'){refresh();showToast(d);return;}
 if(!d.input)return;const r=row(d.input);
 if(d.type==='start'){state(r,'working','正在解析');r.detail.textContent='读取动画和内嵌音频…';}
 if(d.type==='meta'){state(r,'working','正在导出');r.detail.textContent=d.p.w+' × '+d.p.h+' · '+d.p.fps+' fps · '+d.p.frames+' 帧'+(d.meta.hasAudio?' · 含音频':'');}
 if(d.type==='progress'){r.progress.value=d.value;r.label.textContent=d.value+'%';}
 if(d.type==='audio'){r.progress.value=99;r.label.textContent='合入音频';}
 if(d.type==='error'){state(r,d.cancelled?'cancelled':'error',d.cancelled?'已取消':'导出失败');r.detail.textContent=d.message;r.detail.title=d.message;}
 if(d.type==='done'){state(r,'done','已完成');r.progress.value=100;r.output=d.output;r.detail.textContent=d.output;r.detail.title='打开所在目录：'+d.output;r.detail.className='detail output-path';r.detail.onclick=()=>api.reveal(d.output);}
 refresh();
});
api.getSettings().then(s=>{fill(s);document.body.dataset.ready='true';refresh();}).catch(e=>notice(e.message));
