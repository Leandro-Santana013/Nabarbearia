#!/usr/bin/env python3
"""Idempotent Ubuntu bootstrap. Run sudo python3 bootstrap.py DOMAIN [BUCKET]."""
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import urllib.request

domain = sys.argv[1] if len(sys.argv) > 1 else ''
os.environ['DEBIAN_FRONTEND'] = 'noninteractive'
os.environ['NEEDRESTART_MODE'] = 'a'
bucket = sys.argv[2] if len(sys.argv) > 2 else 'nabarbearia-backups'
if os.geteuid() != 0 or not re.fullmatch(r'[a-z0-9-]+\.duckdns\.org', domain) or not re.fullmatch(r'[a-z0-9-]+', bucket):
    raise SystemExit('Usage: sudo python3 bootstrap.py DOMAIN.duckdns.org [bucket-name]')

def run(*args):
    subprocess.run(args, check=True)

run('apt-get', 'update', '-qq')
run('apt-get', 'install', '-y', '-qq', 'caddy', 'python3-venv', 'sqlite3', 'curl', 'iptables-persistent')
for port in ['80', '443']:
    rule = ['INPUT', '-p', 'tcp', '--dport', port, '-j', 'ACCEPT']
    if subprocess.run(['iptables', '-C', *rule], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run('iptables', '-I', *rule)
Path('/etc/iptables').mkdir(exist_ok=True)
Path('/etc/iptables/rules.v4').write_bytes(subprocess.check_output(['iptables-save']))
if subprocess.run(['id', '-u', 'nabarbearia'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
    run('useradd', '--system', '--home-dir', '/var/lib/nabarbearia', '--shell', '/usr/sbin/nologin', 'nabarbearia')
for directory in ['/opt/nabarbearia', '/opt/nabarbearia/ops', '/opt/nabarbearia/releases', '/etc/nabarbearia', '/var/lib/nabarbearia', '/var/lib/nabarbearia/backups']:
    Path(directory).mkdir(parents=True, exist_ok=True)
if not Path('/opt/nabarbearia/venv/bin/python').exists():
    run('python3', '-m', 'venv', '/opt/nabarbearia/venv')
run('/opt/nabarbearia/venv/bin/pip', 'install', '--disable-pip-version-check', 'oci==2.189.0')
Path('/etc/nabarbearia').chmod(0o700)
Path('/var/lib/nabarbearia').chmod(0o700)
shutil.chown('/var/lib/nabarbearia', user='nabarbearia', group='nabarbearia')
Path('/var/lib/nabarbearia/backups').chmod(0o700)
for name in ['operations.py']:
    shutil.copyfile(Path(__file__).parent / name, Path('/opt/nabarbearia/ops') / name)
Path('/usr/local/sbin/nabarbearia').write_text('#!/bin/sh\nexec /opt/nabarbearia/venv/bin/python /opt/nabarbearia/ops/operations.py "$@"\n')
Path('/usr/local/sbin/nabarbearia').chmod(0o755)
environment = Path('/etc/nabarbearia/backend.env')
if not environment.exists():
    with environment.open('x') as output:
        output.write(f'''NABARBEARIA_BIND=127.0.0.1:3001
NABARBEARIA_DB_PATH=/var/lib/nabarbearia/nabarbearia.db
NABARBEARIA_FRONTEND_DIR=/opt/nabarbearia/current/dist
NABARBEARIA_BOOTSTRAP_TOKEN={secrets.token_hex(32)}
NABARBEARIA_ALLOWED_ORIGINS=https://{domain}
NABARBEARIA_SECURE_COOKIES=true
NABARBEARIA_SESSION_DAYS=7
NABARBEARIA_TIMEZONE=America/Sao_Paulo
''')
    environment.chmod(0o600)
backup_env = Path('/etc/nabarbearia/backup.env')
if not backup_env.exists():
    backup_env.write_text(f'OCI_BUCKET={bucket}\n')
    backup_env.chmod(0o600)
Path('/etc/systemd/system/nabarbearia.service').write_text('''[Unit]
Description=NA Barbearia API and frontend
After=network-online.target
Wants=network-online.target
ConditionPathExists=/opt/nabarbearia/current/backend

[Service]
Type=simple
User=nabarbearia
Group=nabarbearia
WorkingDirectory=/opt/nabarbearia/current
EnvironmentFile=/etc/nabarbearia/backend.env
ExecStart=/opt/nabarbearia/current/backend
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/nabarbearia

[Install]
WantedBy=multi-user.target
''')
Path('/etc/systemd/system/nabarbearia-backup.service').write_text('''[Unit]
Description=NA Barbearia verified private database backup
After=network-online.target
ConditionPathExists=/var/lib/nabarbearia/nabarbearia.db

[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/local/sbin/nabarbearia backup
''')
Path('/etc/systemd/system/nabarbearia-backup.timer').write_text('''[Unit]
Description=Daily NA Barbearia backup at 03:00 Sao Paulo

[Timer]
OnCalendar=*-*-* 03:00:00 America/Sao_Paulo
Persistent=true

[Install]
WantedBy=timers.target
''')
Path('/etc/systemd/system/nabarbearia-duckdns.service').write_text('''[Unit]
Description=Update NA Barbearia DuckDNS record
After=network-online.target
ConditionPathExists=/etc/nabarbearia/duckdns.env

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nabarbearia dns-update
''')
Path('/etc/systemd/system/nabarbearia-duckdns.timer').write_text('''[Unit]
Description=Refresh DuckDNS every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
''')
caddyfile = Path('/etc/caddy/Caddyfile')
if caddyfile.exists() and not Path('/etc/caddy/Caddyfile.before-nabarbearia').exists():
    shutil.copyfile(caddyfile, '/etc/caddy/Caddyfile.before-nabarbearia')
caddyfile.write_text(f'''{domain} {{
    @maintenance file {{
        root /opt/nabarbearia
        try_files maintenance
    }}
    handle @maintenance {{
        header Retry-After 60
        respond "Atualizando a NA Barbearia. Tente novamente em instantes." 503
    }}
    handle {{
        reverse_proxy 127.0.0.1:3001
    }}
}}
''')
if not Path('/opt/nabarbearia/current').is_symlink():
    Path('/opt/nabarbearia/maintenance').touch()
run('caddy', 'validate', '--config', '/etc/caddy/Caddyfile')
run('systemctl', 'daemon-reload')
run('systemctl', 'enable', 'nabarbearia.service', 'nabarbearia-backup.timer', 'nabarbearia-duckdns.timer')
run('systemctl', 'enable', '--now', 'caddy')
run('systemctl', 'reload', 'caddy')
run('systemctl', 'start', 'nabarbearia-backup.timer', 'nabarbearia-duckdns.timer')
request = urllib.request.Request('http://169.254.169.254/opc/v2/instance/', headers={'Authorization': 'Bearer Oracle'})
with urllib.request.urlopen(request, timeout=10) as response:
    metadata = json.load(response)
print(json.dumps({key: metadata[key] for key in ['id', 'compartmentId', 'canonicalRegionName']}))
print('Servidor preparado. Configure bucket/IAM, importe o banco e publique a primeira versão.')
