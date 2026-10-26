"""Physical Android regression: cold-start offline, native retry, online recovery.

Run before signing in to the pilot phone. Temporarily disables both networks,
always restores their previous states, and never clears application data.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True)
parser.add_argument('--output-dir', type=Path, default=Path('artifacts/android-offline-check'))
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)
adb_path = Path(os.environ.get('ANDROID_HOME', '')) / 'platform-tools/adb.exe'
adb = [str(adb_path) if adb_path.is_file() else 'adb', '-s', args.serial]


def shell(*command):
    return subprocess.check_output(adb + ['shell', *command], text=True).strip()


def ui():
    for attempt in range(3):
        try:
            shell('uiautomator', 'dump', '--compressed', '/sdcard/nabarbearia-offline-check.xml')
            return ET.fromstring(shell('cat', '/sdcard/nabarbearia-offline-check.xml'))
        except subprocess.CalledProcessError as error:
            if error.returncode != 137 or attempt == 2:
                raise
            time.sleep(1)


def capture(name):
    with (args.output_dir / name).open('wb') as file:
        subprocess.run(adb + ['exec-out', 'screencap', '-p'], stdout=file, check=True)


def retry_button(tree):
    return next((node for node in tree.iter('node') if node.get('text', '').casefold() == 'tentar novamente'), None)


wifi = shell('settings', 'get', 'global', 'wifi_on')
data = shell('settings', 'get', 'global', 'mobile_data')
try:
    shell('svc', 'wifi', 'disable')
    shell('svc', 'data', 'disable')
    time.sleep(2)
    shell('am', 'force-stop', 'br.com.nabarbearia.app')
    shell('am', 'start', '-W', '-n', 'br.com.nabarbearia.app/.MainActivity')
    time.sleep(5)
    capture('offline.png')
    tree = ui()
    button = retry_button(tree)
    assert button is not None, 'Missing native Tentar novamente button on offline cold start'
    assert button.get('class') == 'android.widget.Button', 'Retry must work without loaded JavaScript'
    print('PASS: native offline screen and retry button')
finally:
    shell('svc', 'data', 'enable' if data == '1' else 'disable')
    shell('svc', 'wifi', 'enable' if wifi in ('1', '2') else 'disable')
    print('Previous Wi-Fi and mobile-data states restored')

time.sleep(4)
for attempt in range(8):
    tree = ui()
    button = retry_button(tree)
    if button is not None:
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', button.get('bounds')))
        shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
    time.sleep(2)
    content = ET.tostring(ui(), encoding='unicode')
    if 'Acesso da equipe' in content:
        capture('recovered.png')
        print('PASS: retry restored online staff login')
        break
else:
    capture('recovery-failed.png')
    raise AssertionError('Staff login did not recover after restoring networks')
