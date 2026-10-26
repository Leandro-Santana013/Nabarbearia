#!/usr/bin/env python3
"""Authorize a dedicated CI key, without giving GitHub the operator's SSH key."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

if os.geteuid() != 0 or len(sys.argv) != 2:
    raise SystemExit('Usage: sudo python3 authorize-ci.py PUBLIC_KEY_FILE')
key = Path(sys.argv[1]).read_text().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]+)?', key):
    raise SystemExit('Expected one OpenSSH ed25519 public key')
subprocess.run(['ssh-keygen', '-l', '-f', sys.argv[1]], check=True)
user = 'nabarbearia-deploy'
if subprocess.run(['id', '-u', user], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
    subprocess.run(['useradd', '--create-home', '--shell', '/bin/bash', user], check=True)
directory = Path('/home') / user / '.ssh'
directory.mkdir(parents=True, exist_ok=True)
directory.chmod(0o700)
authorized = directory / 'authorized_keys'
authorized.write_text('restrict ' + key + '\n')
authorized.chmod(0o600)
shutil.chown(directory, user=user, group=user)
shutil.chown(authorized, user=user, group=user)
sudoers = Path('/etc/sudoers.d/nabarbearia-deploy')
sudoers.write_text(f'{user} ALL=(root) NOPASSWD: /usr/local/sbin/nabarbearia deploy *\n')
sudoers.chmod(0o440)
subprocess.run(['visudo', '-cf', str(sudoers)], check=True)
print('CI autorizado apenas para publicar a aplicação, com chave separada do operador.')
