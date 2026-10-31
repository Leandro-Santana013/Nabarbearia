"""Record cold/warm Android entry and fail on a nearly full black content frame.

Requires adb, ffmpeg and Pillow. Does not clear app data or change connectivity.
Videos/screenshots stay local; they can contain the signed-in user's app content.
Use --video to analyze an existing recording without touching the phone.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial')
parser.add_argument('--package', default='br.com.nabarbearia.app')
parser.add_argument('--mode', choices=['cold', 'warm'], default='cold')
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--video', type=Path)
parser.add_argument('--no-empty-loading', action='store_true', help='Fail on plain app-background frames between logo and app')
parser.add_argument('--duration', type=int, default=7, choices=range(7, 31), help='Recording time in seconds (7-30)')
parser.add_argument('--expect-dashboard', action='store_true', help='Require the recording to reach content beyond the launch logo')
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)
video = args.video
if video is None:
    if not args.serial:
        parser.error('--serial is required when recording')
    adb = ['adb', '-s', args.serial]
    def shell(*command):
        return subprocess.check_output(adb + ['shell', *command], text=True).strip()
    if 'mWakefulness=Awake' not in shell('dumpsys', 'power'):
        raise RuntimeError('Wake and unlock the phone before recording app entry')
    if args.mode == 'cold':
        shell('am', 'force-stop', args.package)
    else:
        shell('input', 'keyevent', 'KEYCODE_HOME')
        time.sleep(.5)
    remote = '/sdcard/na-startup-check.mp4'
    recorder = subprocess.Popen(adb + ['shell', 'screenrecord', '--time-limit', str(args.duration),
                                      '--size', '540x1200', remote],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        time.sleep(.4)
        launch = shell('am', 'start', '-W', '-n', args.package + '/br.com.nabarbearia.app.MainActivity')
        (args.output_dir / 'launch.txt').write_text(launch + '\n', encoding='utf8')
        _, errors = recorder.communicate(timeout=args.duration + 28)
        if recorder.returncode:
            raise RuntimeError(errors.decode(errors='replace'))
    finally:
        if recorder.poll() is None:
            # Stop only the screenrecord started by this test, not app processes.
            recording_pids = subprocess.run(adb + ['shell', 'pidof', 'screenrecord'],
                                            capture_output=True, text=True).stdout.split()
            for pid in recording_pids:
                command = shell('cat', f'/proc/{pid}/cmdline')
                if remote in command:
                    shell('kill', '-2', pid)
            recorder.terminate()
            recorder.wait(timeout=5)
    video = args.output_dir / 'entry.mp4'
    subprocess.run(adb + ['pull', remote, str(video)], check=True, capture_output=True)
    with (args.output_dir / 'settled.png').open('wb') as file:
        subprocess.run(adb + ['exec-out', 'screencap', '-p'], stdout=file, check=True)

# Sample 30 frames/s. Ignore Android's system bars and thin edge overlays.
width, height, fps = 108, 240, 30
decoded = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video),
                          '-vf', f'fps={fps},scale={width}:{height}', '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
frame_bytes = width * height * 3
black_times, empty_times, frames = [], [], []
final_background_fraction = 1.0
for offset in range(0, len(decoded), frame_bytes):
    data = decoded[offset:offset + frame_bytes]
    if len(data) != frame_bytes:
        break
    frame = Image.frombytes('RGB', (width, height), data)
    center = frame.crop((width // 10, height // 10, width * 9 // 10, height * 9 // 10))
    pixels = center.tobytes()
    uniform = sum(max(abs(pixels[i] - 244), abs(pixels[i + 1] - 244), abs(pixels[i + 2] - 246)) <= 4 for i in range(0, len(pixels), 3))
    if uniform / (center.width * center.height) > .997:
        empty_times.append(round(offset / frame_bytes / fps, 3))
    final_background_fraction = uniform / (center.width * center.height)
    histogram = frame.crop((5, 24, width - 5, height - 24)).convert('L').histogram()
    dark_fraction = sum(histogram[:32]) / sum(histogram)
    timestamp = offset / frame_bytes / fps
    if dark_fraction > .98:
        black_times.append(round(timestamp, 3))
        if len(black_times) == 1:
            frame.save(args.output_dir / 'first-black-frame.png')
    if (offset // frame_bytes) % 3 == 0:
        frames.append((timestamp, frame))

sheet = Image.new('RGB', (width * 10, (height + 18) * ((len(frames) + 9) // 10)), 'white')
draw = ImageDraw.Draw(sheet)
for index, (timestamp, frame) in enumerate(frames):
    x, y = (index % 10) * width, (index // 10) * (height + 18)
    sheet.paste(frame, (x, y + 18))
    draw.text((x + 2, y + 2), f'{timestamp:.1f}s', fill='black')
sheet.save(args.output_dir / 'timeline.jpg')
report = {'mode': args.mode, 'video': str(video), 'sample_fps': fps,
          'frames': len(decoded) // frame_bytes, 'black_frame_times_seconds': black_times,
          'empty_background_times_seconds': empty_times,
          'final_background_fraction': round(final_background_fraction, 4),
          'black_sample_duration_ms': round(len(black_times) * 1000 / fps)}
(args.output_dir / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report))
assert report['frames'] > 15, 'Recording too short to validate entry'
assert not black_times, f'Black content detected in {len(black_times)} sampled frames'
if args.no_empty_loading:
    assert not empty_times, f'Empty loading background detected in {len(empty_times)} sampled frames'
if args.expect_dashboard:
    assert final_background_fraction < .8, 'Recording ended on the logo/background; extend --duration and inspect the transition'
print('PASS: no black content frame during entry; inspect timeline for intermediate screens')
