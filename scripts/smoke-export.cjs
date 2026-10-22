'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),electron=require('electron'),ffmpeg=path.join(root,'bin','ffmpeg.exe'),base=path.join(root,'.smoke-output');
fs.rmSync(base,{recursive:true,force:true});fs.mkdirSync(base,{recursive:true});
function exportFixture(name,options,folder){
 const out=path.join(base,folder);fs.mkdirSync(out,{recursive:true});
 const run=spawnSync(electron,[root,'--self-test',path.join(root,'tests',name+'.svga')],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,SVGA_FFMPEG:ffmpeg,TEST_OUTPUT:out,TEST_OPTIONS:JSON.stringify(options),SVGA_TEST_SETTINGS:path.join(base,'settings-'+folder)}});
 if(run.error)throw run.error;
 assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
 const result=run.stdout.split(/\r?\n/).find(line=>line.startsWith('TEST_RESULT '));
 assert.ok(result,'Exporter did not confirm completion\n'+run.stdout+'\n'+run.stderr);
 return JSON.parse(result.slice('TEST_RESULT '.length));
}
function decode(file,w,h){
 const run=spawnSync(ffmpeg,['-v','error','-i',file,'-map','0:v:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:16*1024*1024,timeout:60000});
 if(run.error)throw run.error;assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.length,w*h*4);return run.stdout;
}
const expanded=exportFixture('fixture-expansion',{},'expanded');assert.equal(expanded.p.w,464);assert.equal(expanded.p.h,464);assert.equal(expanded.p.fps,12);assert.equal(expanded.meta.hasAudio,true);
const original=exportFixture('fixture-expansion',{padding:0},'original');assert.equal(original.p.w,64);
const a=decode(expanded.output,464,464),b=decode(original.output,64,64);
for(let y=0;y<64;y++)assert.deepEqual(a.subarray(((y+200)*464+200)*4,((y+200)*464+264)*4),b.subarray(y*64*4,(y+1)*64*4));
for(const [x,y] of [[-10,22],[70,22],[22,-10],[22,70],[92,92]])assert.equal(a[((y+200)*464+(x+200))*4+3],128);
assert.equal(a[(222*464+302)*4+3],0,'Source mask must remain active');
function decodeAudio(file){const r=spawnSync(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-f','s24le','-'],{maxBuffer:8*1024*1024,timeout:60000});assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
assert.deepEqual(decodeAudio(expanded.output),decodeAudio(original.output));
const silent=exportFixture('fixture',{padding:0},'silent');assert.equal(silent.meta.hasAudio,false);
console.log('Windows smoke tests passed: outside-canvas recovery, unchanged center, alpha, audio and silent inputs.');
