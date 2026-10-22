'use strict';
const path = require('path');
const defaults = {scale:1, fps:0, codec:'png', compression:6, loops:1, padding:200, outputDir:''};
function settings(raw={}) {
 const s={...defaults,...raw};
 if(![0.5,1,1.5,2,3,4].includes(Number(s.scale))) throw Error('尺寸倍率无效');
 if(!Number.isFinite(Number(s.fps))||s.fps<0||s.fps>120) throw Error('帧率需在 1–120 之间，0 表示原帧率');
 if(!Number.isInteger(Number(s.padding))||s.padding<0||s.padding>4096) throw Error('四周扩充需为 0–4096 的整数像素');
 if(!['png','prores'].includes(s.codec)) throw Error('编码无效');
 if(!Number.isInteger(Number(s.compression))||s.compression<0||s.compression>9) throw Error('PNG 压缩级别需在 0–9 之间');
 if(!Number.isInteger(Number(s.loops))||s.loops<1||s.loops>100) throw Error('循环次数需在 1–100 之间');
 return {...s,padding:Number(s.padding),scale:Number(s.scale),fps:Number(s.fps),compression:Number(s.compression),loops:Number(s.loops),outputDir:String(s.outputDir||'')};
}
function plan(meta, raw) {
 const s=settings(raw), contentW=Math.round(meta.width*s.scale),contentH=Math.round(meta.height*s.scale),w=contentW+2*s.padding,h=contentH+2*s.padding,fps=s.fps||meta.fps;
 if(contentW<1||contentH<1)throw Error('SVGA 原始尺寸无效');
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>8192||h>8192||w*h>33554432) throw Error('导出尺寸无效或过大（单边最多8192，最多3200万像素）');
 if(!Number.isFinite(meta.fps)||meta.fps<=0||!Number.isInteger(meta.frames)||meta.frames<1||!Number.isFinite(fps)||fps<=0) throw Error('SVGA 帧信息无效');
 return {w,h,contentW,contentH,fps,frames:Math.max(1,Math.round(meta.frames/meta.fps*fps))*s.loops,cycleFrames:Math.max(1,Math.round(meta.frames/meta.fps*fps)),...s, fps};
}
function frameAt(i,p,meta){return Math.min(meta.frames-1,Math.floor((i%p.cycleFrames)*meta.fps/p.fps));}
function outputName(input,dir){return path.join(dir||path.dirname(input),path.basename(input,path.extname(input))+'_mov导出.mov');}
function encoderArgs(p,output){return ['-hide_banner','-loglevel','error','-n','-f','image2pipe','-framerate',String(p.fps),'-c:v','png','-i','pipe:0','-an',...(p.codec==='png'?['-c:v','png','-pix_fmt','rgba','-compression_level',String(p.compression)]:['-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-alpha_bits','16']),'-threads','2','-f','mov',output];}
module.exports={defaults,settings,plan,frameAt,outputName,encoderArgs};
