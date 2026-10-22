const fs=require('fs'),zlib=require('zlib'),pb=require('protobufjs'),JSZip=require('jszip');
(async()=>{const root=await pb.load(__dirname+'/svga.proto'),Movie=root.lookupType('com.opensource.svga.MovieEntity');
const png=fs.readFileSync(__dirname+'/sprite.png');const frames=Array.from({length:12},(_,i)=>({alpha:0.5+i/24,layout:{x:0,y:0,width:16,height:16},transform:{a:1,b:0,c:0,d:1,tx:8+i*2,ty:10}}));
const obj={version:'2.0',params:{viewBoxWidth:65,viewBoxHeight:63,fps:12,frames:12},images:{sprite:png},sprites:[{imageKey:'sprite',frames}]};fs.writeFileSync(__dirname+'/fixture.svga',zlib.deflateSync(Movie.encode(Movie.create(obj)).finish()));
const zip=new JSZip();zip.file('movie.spec',JSON.stringify({movie:{viewBox:{width:65,height:63},fps:12,frames:12},images:{sprite:'sprite'},sprites:[{imageKey:'sprite',frames}]}));zip.file('sprite.png',png);fs.writeFileSync(__dirname+'/fixture-v1.svga',await zip.generateAsync({type:'nodebuffer'}));})();
