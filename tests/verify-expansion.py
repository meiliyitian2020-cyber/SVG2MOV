import subprocess, json, sys
import numpy as np
from pathlib import Path
base=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent/'expansion-out'
def decode(folder,w,h):
 p=base/folder/'fixture-expansion_mov导出.mov'
 streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))['streams']
 assert (streams[0]['width'],streams[0]['height'])==(w,h)
 assert streams[0]['codec_name']=='png' and streams[0]['pix_fmt']=='rgba'
 assert streams[0]['r_frame_rate']=='12/1' and streams[0]['nb_frames']=='12'
 assert streams[1]['codec_name']=='pcm_s24le'
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:v:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'])
 return np.frombuffer(data,np.uint8).reshape((h,w,4)),p
expanded,p=decode('pad200',464,464);original,q=decode('pad0-retest',64,64)
assert np.array_equal(expanded[200:264,200:264],original),'Original center changed'
for x,y in [(-10,22),(70,22),(22,-10),(22,70),(92,92)]:
 assert expanded[y+200,x+200,3]==128,(x,y,expanded[y+200,x+200])
# Fully outside source content is present, while the source's own mask remains active.
assert expanded[222,292,3]==128
assert expanded[222,302,3]==0
assert expanded[0,0,3]==0
# Subject dimensions do not grow merely because the canvas is extended.
assert np.count_nonzero(expanded[220,200:264,3])==24
scaled,r=decode('scale2',528,528)
assert scaled[244,180,3]>0 # native x=-10 scaled and translated into 200px margin
assert scaled[244,244,3]==128
assert scaled[244,404,3]==0 # masked half remains absent after 2x scale
# Audio does not change with the render bounds.
def audio(path):return subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-map','0:a:0','-f','s24le','-'])
assert audio(p)==audio(q)==audio(r)
print('PASS: recovered content on all four sides and entirely outside original viewbox; unchanged center; preserved source mask; scale independence; identical audio')
