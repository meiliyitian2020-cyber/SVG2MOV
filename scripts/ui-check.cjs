'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.smoke-output','ui');
fs.rmSync(base,{recursive:true,force:true});fs.mkdirSync(base,{recursive:true});
const settings=path.join(root,'.smoke-output','ui-settings');fs.rmSync(settings,{recursive:true,force:true});
const args=[root,'--ui-check'];if(process.platform==='linux')args.unshift('--no-sandbox','--ozone-platform=headless');
const result=spawnSync(require('electron'),args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000,env:{...process.env,UI_TEST_OUTPUT:base,SVGA_TEST_SETTINGS:settings,SVGA_FFMPEG:process.env.SVGA_FFMPEG||path.join(root,'bin','ffmpeg.exe')}});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;
if(result.status!==0||!result.stdout.includes('UI_CHECK_PASS:'))process.exit(result.status||1);
