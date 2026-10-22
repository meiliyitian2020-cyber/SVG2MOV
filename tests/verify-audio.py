import json, subprocess, numpy as np
from pathlib import Path
base=Path(__file__).parent/'audio-out'
p=base/'fixture-audio_mov导出.mov'
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))['streams']
assert meta[0]['codec_name']=='png' and meta[0]['pix_fmt']=='rgba' and meta[0]['nb_frames']=='60'
assert meta[1]['codec_name']=='pcm_s24le' and float(meta[1]['duration'])==2
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-f','f32le','-ac','1','-ar','48000','-'])
a=np.frombuffer(raw,dtype='<f4');rate=48000
assert len(a)==rate*2
rms=lambda b: float(np.sqrt(np.mean(b*b)))
seg=lambda start,end:a[round(start*rate):round(end*rate)]
assert rms(seg(0,.24))<1e-6
assert rms(seg(.27,.47))>.03
# startTime=200ms skips the initial 440 Hz; the first segment must contain 880 Hz.
b=seg(.28,.48);freq=np.fft.rfftfreq(len(b),1/rate);fft=np.abs(np.fft.rfft(b));peak=freq[np.argmax(fft)]
assert abs(peak-880)<10,peak
# Overlap contains both source frequencies without normalization ducking.
b=seg(.55,.70);freq=np.fft.rfftfreq(len(b),1/rate);fft=np.abs(np.fft.rfft(b))
for hz in (660,880):assert fft[np.argmin(abs(freq-hz))]>20
assert np.max(np.abs(a[:rate]-a[rate:]))<1e-6
for filename,has_audio in [('fixture-v1-audio_mov导出.mov',True),('fixture_mov导出.mov',False)]:
 streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(base/filename)]))['streams']
 assert any(s['codec_type']=='audio' for s in streams)==has_audio
print('PASS: audio stream, source seek, delayed onset, overlap, exact loop timing, legacy ZIP, and silent-file regression')
