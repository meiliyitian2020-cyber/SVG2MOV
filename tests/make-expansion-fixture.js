const fs=require('fs'),pb=require('protobufjs'),zlib=require('zlib');
const Movie=pb.loadSync(__dirname+'/svga.proto').lookupType('com.opensource.svga.MovieEntity');
const movie=Movie.decode(zlib.inflateSync(fs.readFileSync(__dirname+'/fixture-audio.svga')));
movie.params.viewBoxWidth=64;movie.params.viewBoxHeight=64;
const positions=[[20,20],[-12,20],[60,20],[20,-12],[20,60],[90,90],[90,20]];
movie.sprites=positions.map(([tx,ty],j)=>({imageKey:'sprite',frames:Array.from({length:12},()=>({alpha:0.5,layout:{x:0,y:0,width:16,height:16},transform:{a:1,b:0,c:0,d:1,tx,ty},...(j===6?{clipPath:'M0 0 L8 0 L8 16 L0 16 Z'}:{})}))}));
fs.writeFileSync(__dirname+'/fixture-expansion.svga',zlib.deflateSync(Movie.encode(movie).finish()));
