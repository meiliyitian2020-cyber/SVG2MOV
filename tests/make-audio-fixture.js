const fs=require('fs'),zlib=require('zlib'),pb=require('protobufjs'),JSZip=require('jszip');
(async()=>{const root=await pb.load(__dirname+'/svga.proto'),Movie=root.lookupType('com.opensource.svga.MovieEntity');const movie=Movie.decode(zlib.inflateSync(fs.readFileSync(__dirname+'/fixture.svga')));
movie.images.audio0=fs.readFileSync(__dirname+'/tone.wav');movie.images.audio1=fs.readFileSync(__dirname+'/tone2.mp3');
movie.audios=[{audioKey:'audio0',startFrame:3,endFrame:9,startTime:200,totalTime:1000},{audioKey:'audio1',startFrame:6,endFrame:12,startTime:0,totalTime:1000}];
fs.writeFileSync(__dirname+'/fixture-audio.svga',zlib.deflateSync(Movie.encode(movie).finish()));
const zip=new JSZip(),spec={movie:{viewBox:{width:65,height:63},fps:12,frames:12},images:{sprite:'sprite',audio0:'audio0.wav',audio1:'audio1.mp3'},sprites:movie.sprites,audios:movie.audios};zip.file('movie.spec',JSON.stringify(spec));zip.file('sprite.png',fs.readFileSync(__dirname+'/sprite.png'));zip.file('audio0.wav',movie.images.audio0);zip.file('audio1.mp3',movie.images.audio1);fs.writeFileSync(__dirname+'/fixture-v1-audio.svga',await zip.generateAsync({type:'nodebuffer'}));
})();
