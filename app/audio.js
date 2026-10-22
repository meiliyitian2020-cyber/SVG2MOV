'use strict';
const zlib=require('zlib'),protobuf=require('protobufjs'),JSZip=require('jszip');
// Wire field numbers from the official SVGA format; skip visual fields already decoded by the renderer.
const schema=`syntax="proto3";
message AudioEntity { string audioKey=1; int32 startFrame=2; int32 endFrame=3; int32 startTime=4; int32 totalTime=5; }
message MovieEntity { map<string,bytes> images=3; repeated AudioEntity audios=5; }`;
const Movie=protobuf.parse(schema).root.lookupType('MovieEntity');
async function extract(bytes){
 let movie,zip;
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  zip=await JSZip.loadAsync(bytes);
  if(zip.file('movie.binary'))movie=Movie.decode(await zip.file('movie.binary').async('nodebuffer'));
  else {const spec=zip.file('movie.spec');if(!spec)throw Error('SVGA ZIP 缺少 movie.spec');movie=JSON.parse(await spec.async('string'));}
 }else movie=Movie.decode(zlib.inflateSync(bytes,{maxOutputLength:512*1024*1024}));
 const assets=new Map(),clips=[];
 for(const a of movie.audios||[]){
  const key=String(a.audioKey||'');
  const startFrame=Number(a.startFrame||0),endFrame=Number(a.endFrame||0),startTime=Number(a.startTime||0);
  if(!key||![startFrame,endFrame,startTime].every(Number.isFinite)||startFrame<0||endFrame<startFrame||startTime<0)throw Error('SVGA 音频时间信息无效');
  if(endFrame===startFrame)continue;
  if(!assets.has(key)){
   let data=movie.images?.[key];
   if(typeof data==='string'&&zip){
    const file=zip.file(data)||zip.file(data+'.mp3')||zip.file(data+'.wav');data=file?await file.async('nodebuffer'):null;
   }
   if((!data||!data.length)&&zip){const file=zip.file(key)||zip.file(key+'.mp3')||zip.file(key+'.wav');data=file?await file.async('nodebuffer'):null;}
   if(!data||!data.length)throw Error('缺少内嵌音频资源：'+key);
   assets.set(key,Buffer.from(data));
  }
  clips.push({key,startFrame,endFrame,startTime});
 }
 let renderBytes=bytes;
 // The legacy visual parser treats every ZIP image entry as PNG. Keep audio
 // for offline mixing, but hide those entries from the visual-only copy.
 if(zip&&zip.file('movie.spec')&&clips.length){
  const spec=JSON.parse(await zip.file('movie.spec').async('string'));
  for(const key of assets.keys())if(spec.images)delete spec.images[key];
  spec.audios=[];zip.file('movie.spec',JSON.stringify(spec));
  renderBytes=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 }
 return {assets,clips,renderBytes};
}
function cycleArgs(audio,paths,meta,p,output){
 const duration=p.cycleFrames/p.fps,inputs=['-f','lavfi','-i',`anullsrc=r=48000:cl=stereo:d=${duration}`],filters=[],labels=['[0:a]'];
 let index=1;
 for(const a of audio.clips){
  const start=a.startFrame/meta.fps,end=Math.min(a.endFrame/meta.fps,duration);
  if(start>=duration||end<=start)continue;
  inputs.push('-i',paths.get(a.key));
  const delay=Math.round(start*48000);
  filters.push(`[${index}:a]atrim=start=${a.startTime/1000}:duration=${end-start},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${delay}S:all=1[a${index}]`);
  labels.push(`[a${index}]`);index++;
 }
 filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,atrim=duration=${duration}[mix]`);
 return ['-hide_banner','-loglevel','error','-n',...inputs,'-filter_complex',filters.join(';'),'-map','[mix]','-c:a','pcm_f32le',output];
}
function muxArgs(video,audio,p,output){return ['-hide_banner','-loglevel','error','-n','-i',video,'-stream_loop',String(p.loops-1),'-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','pcm_s24le','-ar','48000','-t',String(p.frames/p.fps),'-f','mov',output];}
module.exports={extract,cycleArgs,muxArgs};
