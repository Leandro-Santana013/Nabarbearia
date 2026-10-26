#!/usr/bin/env python3
"""SQLite snapshots and single-instance releases. Server commands run as root on Ubuntu."""
import argparse
import contextlib
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path('/opt/nabarbearia')
DATA = Path('/var/lib/nabarbearia')
CONFIG = Path('/etc/nabarbearia')
BACKUPS = DATA / 'backups'
DB = DATA / 'nabarbearia.db'
RELEASES = ROOT / 'releases'
MAINTENANCE = ROOT / 'maintenance'
SERVICE = 'nabarbearia.service'


def run(*args):
    subprocess.run(args, check=True)


def env_file(path):
    """Files contain literal KEY=value, without shell interpolation."""
    result = {}
    for line in path.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
    return result


def database_info(path):
    with contextlib.closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as connection:
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity_check failed')
        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        if not {'users', 'sessions', 'schema_migrations'}.issubset(tables):
            raise RuntimeError('Not a NA Barbearia database')
        counts = {table: connection.execute('SELECT COUNT(*) FROM "' + table.replace('"', '""') + '"').fetchone()[0] for table in tables}
        migrations = [list(row) for row in connection.execute('SELECT * FROM schema_migrations ORDER BY version')]
    return {'counts': counts, 'migrations': migrations}


def copy_database(source, destination, revoke_sessions=False):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file() or source == destination or destination.exists():
        raise RuntimeError('Source must exist and destination must be a new, separate file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with contextlib.closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src:
            with contextlib.closing(sqlite3.connect(destination)) as target:
                src.backup(target)
                if revoke_sessions:
                    target.execute('DELETE FROM sessions')
                    target.commit()
                target.execute('PRAGMA journal_mode=DELETE')
        destination.chmod(0o600)
        return database_info(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def revision():
    current = ROOT / 'current'
    return current.resolve().name if current.is_symlink() else None


def cloud():
    import oci  # Isolated virtualenv; credentials stay in instance identity.
    settings = env_file(CONFIG / 'backup.env')
    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner(timeout=15)
    client = oci.object_storage.ObjectStorageClient({}, signer=signer, timeout=(10, 60))
    namespace = settings.get('OCI_NAMESPACE') or client.get_namespace().data
    return client, namespace, settings['OCI_BUCKET']


def snapshot():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    name = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    raw = BACKUPS / (name + '.db')
    info = copy_database(DB, raw)
    packed = BACKUPS / (name + '.db.gz')
    with raw.open('rb') as src, gzip.open(packed, 'wb') as target:
        shutil.copyfileobj(src, target)
    raw.unlink()
    packed.chmod(0o600)
    manifest = {'revision': revision(), 'database': info, 'sha256': hashlib.sha256(packed.read_bytes()).hexdigest()}
    sidecar = BACKUPS / (name + '.json')
    sidecar.write_text(json.dumps(manifest))
    sidecar.chmod(0o600)
    client, namespace, bucket = cloud()
    bucket_info = client.get_bucket(namespace, bucket).data
    if bucket_info.public_access_type != 'NoPublicAccess':
        raise RuntimeError('Backup bucket must be private')
    for path in (packed, sidecar):
        with path.open('rb') as body:
            client.put_object(namespace, bucket, 'nabarbearia/' + path.name, body)
    # Prove the uploaded snapshot can be read, independently of the local copy.
    uploaded = client.get_object(namespace, bucket, 'nabarbearia/' + packed.name).data.content
    if hashlib.sha256(uploaded).hexdigest() != manifest['sha256']:
        raise RuntimeError('Remote backup checksum mismatch')
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)
    import oci
    objects = oci.pagination.list_call_get_all_results(client.list_objects, namespace, bucket, prefix='nabarbearia/', fields='name,timeCreated').data.objects
    for obj in objects:
        if obj.time_created < cutoff and re.fullmatch(r'nabarbearia/\d{8}T\d{12}Z\.(db\.gz|json)', obj.name):
            client.delete_object(namespace, bucket, obj.name)
    for path in BACKUPS.iterdir():
        if path.is_file() and path.stat().st_mtime < cutoff.timestamp() and re.fullmatch(r'\d{8}T\d{12}Z\.(db\.gz|json)', path.name):
            path.unlink()
    print('Backup local e remoto verificado:', name, flush=True)
    return name


def fetch_backup(name):
    if not re.fullmatch(r'\d{8}T\d{12}Z', name):
        raise ValueError('Invalid backup ID')
    client, namespace, bucket = cloud()
    manifest = json.loads(client.get_object(namespace, bucket, 'nabarbearia/' + name + '.json').data.content)
    content = client.get_object(namespace, bucket, 'nabarbearia/' + name + '.db.gz').data.content
    if hashlib.sha256(content).hexdigest() != manifest['sha256']:
        raise RuntimeError('Remote backup checksum mismatch')
    return manifest, content


def restored_file(name, directory, remote=True):
    if remote:
        manifest, content = fetch_backup(name)
    else:
        manifest = json.loads((BACKUPS / (name + '.json')).read_text())
        content = (BACKUPS / (name + '.db.gz')).read_bytes()
        if hashlib.sha256(content).hexdigest() != manifest['sha256']:
            raise RuntimeError('Local backup checksum mismatch')
    path = directory / 'nabarbearia.db'
    path.write_bytes(gzip.decompress(content))
    path.chmod(0o600)
    if database_info(path) != manifest['database']:
        raise RuntimeError('Restored database differs from backup manifest')
    return manifest, path


def health(port=3001):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health', timeout=3) as response:
            return json.load(response).get('status') == 'ok'
    except Exception:
        return False


def wait_health(port=3001):
    for _ in range(30):
        if health(port):
            return
        time.sleep(1)
    raise RuntimeError('Backend health check failed')


def link_current(target):
    if target.parent != RELEASES or not target.is_dir():
        raise RuntimeError('Invalid release directory')
    staged = ROOT / '.current-next'
    staged.unlink(missing_ok=True)
    staged.symlink_to(target, target_is_directory=True)
    staged.replace(ROOT / 'current')


def replace_database(source):
    # Only call while the application service is stopped.
    for suffix in ('-wal', '-shm'):
        Path(str(DB) + suffix).unlink(missing_ok=True)
    incoming = DATA / 'restore-incoming.db'
    shutil.copyfile(source, incoming)
    incoming.chmod(0o600)
    shutil.chown(incoming, user='nabarbearia', group='nabarbearia')
    incoming.replace(DB)


def extract_release(archive, release_id):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', release_id):
        raise ValueError('Invalid release ID')
    destination = RELEASES / release_id
    if destination.exists():
        raise RuntimeError('Release already exists; use a new revision')
    destination.mkdir(parents=True)
    try:
        with tarfile.open(archive, 'r:gz') as bundle:
            for member in bundle.getmembers():
                parts = Path(member.name).parts
                if member.issym() or member.islnk() or not (member.isfile() or member.isdir()) or Path(member.name).is_absolute() or '..' in parts:
                    raise RuntimeError('Unsafe archive member')
                if not parts or parts[0] not in {'backend', 'dist', 'REVISION'}:
                    raise RuntimeError('Release may only contain backend, dist and REVISION; no database or secrets')
                if parts[0] in {'backend', 'REVISION'} and len(parts) != 1:
                    raise RuntimeError('Invalid release layout')
            bundle.extractall(destination, filter='data')
        if not (destination / 'dist/index.html').is_file() or not (destination / 'backend').is_file():
            raise RuntimeError('Incomplete release')
        if (destination / 'REVISION').read_text().strip() != release_id:
            raise RuntimeError('Release revision mismatch')
        (destination / 'backend').chmod(0o755)
        return destination
    except Exception:
        shutil.rmtree(destination)
        raise


def deploy(archive, release_id):
    if not DB.is_file():
        raise RuntimeError('Import the initial database before publishing')
    if revision() == release_id and health():
        print('Esta revisão já está publicada e saudável:', release_id)
        return
    destination = extract_release(archive, release_id)
    previous = revision()
    MAINTENANCE.touch()
    backup = None
    try:
        run('systemctl', 'stop', SERVICE)
        backup = snapshot()  # Cloud failure blocks publication; it never silently disables backups.
        link_current(destination)
        run('systemctl', 'start', SERVICE)
        wait_health()
        if previous:
            old = ROOT / 'previous'
            old.unlink(missing_ok=True)
            old.symlink_to(RELEASES / previous, target_is_directory=True)
        MAINTENANCE.unlink(missing_ok=True)
        print('Publicado:', release_id)
    except Exception:
        run('systemctl', 'stop', SERVICE)
        if backup:
            with tempfile.TemporaryDirectory(dir=BACKUPS) as temp:
                _, restored = restored_file(backup, Path(temp), remote=False)
                replace_database(restored)
        if previous:
            link_current(RELEASES / previous)
            run('systemctl', 'start', SERVICE)
            wait_health()
            MAINTENANCE.unlink(missing_ok=True)
        raise


def import_database(source):
    if DB.exists() or (ROOT / 'current').exists():
        raise RuntimeError('Initial import refused: server already has a database or release')
    copy_database(source, DB, revoke_sessions=True)
    shutil.chown(DB, user='nabarbearia', group='nabarbearia')
    print('Base inicial importada; sessões antigas invalidadas.')


def test_restore(name):
    import pwd
    # The service user can traverse DATA, but deliberately cannot enter root-only BACKUPS.
    with tempfile.TemporaryDirectory(prefix='.restore-test-', dir=DATA) as temp:
        directory = Path(temp)
        _, restored = restored_file(name, directory)
        account = pwd.getpwnam('nabarbearia')
        shutil.chown(directory, user='nabarbearia', group='nabarbearia')
        shutil.chown(restored, user='nabarbearia', group='nabarbearia')
        environment = {**os.environ, **env_file(CONFIG / 'backend.env'),
                       'NABARBEARIA_DB_PATH': str(restored), 'NABARBEARIA_BIND': '127.0.0.1:3012'}
        def drop_privileges():
            os.setgroups([])
            os.setgid(account.pw_gid)
            os.setuid(account.pw_uid)
        process = subprocess.Popen([str(ROOT / 'current/backend')], env=environment, preexec_fn=drop_privileges,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            wait_health(3012)
        finally:
            process.terminate()
            process.wait(timeout=15)
    print('Restauração remota, integridade, contagens e inicialização do backend verificadas.')


def restore(name):
    with tempfile.TemporaryDirectory(dir=BACKUPS) as temp:
        manifest, restored = restored_file(name, Path(temp))
        target = RELEASES / (manifest['revision'] or '')
        if not manifest['revision'] or not target.is_dir():
            raise RuntimeError('The matching application release is unavailable')
        MAINTENANCE.touch()
        run('systemctl', 'stop', SERVICE)
        snapshot()  # Preserve the current state before an explicitly requested restoration.
        replace_database(restored)
        link_current(target)
        run('systemctl', 'start', SERVICE)
        wait_health()
        MAINTENANCE.unlink(missing_ok=True)
        print('Banco e versão correspondente restaurados:', name)


def dns_update():
    settings = env_file(CONFIG / 'duckdns.env')
    domain = settings['DUCKDNS_DOMAIN']
    if not re.fullmatch(r'[a-z0-9-]+', domain):
        raise ValueError('DUCKDNS_DOMAIN must contain only the subdomain label')
    query = urllib.parse.urlencode({'domains': domain, 'token': settings['DUCKDNS_TOKEN'], 'ip': ''})
    # Token is constructed in-process, never placed in command arguments or operator output.
    with urllib.request.urlopen('https://www.duckdns.org/update?' + query, timeout=20) as response:
        if response.read().strip() != b'OK':
            raise RuntimeError('DuckDNS update failed')
    print('DuckDNS atualizado.')


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    export = sub.add_parser('export')
    export.add_argument('source', type=Path)
    export.add_argument('destination', type=Path)
    export.add_argument('--revoke-sessions', action='store_true')
    for command in ('import', 'test-restore', 'restore'):
        sub.add_parser(command).add_argument('value')
    publish = sub.add_parser('deploy')
    publish.add_argument('archive', type=Path)
    publish.add_argument('revision')
    sub.add_parser('backup')
    sub.add_parser('dns-update')
    args = parser.parse_args()
    if args.command == 'export':
        copy_database(args.source, args.destination, args.revoke_sessions)
        print('Snapshot consistente criado:', args.destination)
        return
    if os.name != 'posix' or os.geteuid() != 0:
        parser.error('Server commands require root on Linux')
    import fcntl
    with open('/run/lock/nabarbearia-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == 'deploy':
            deploy(args.archive, args.revision)
        elif args.command == 'import':
            import_database(Path(args.value))
        elif args.command == 'backup':
            snapshot()
        elif args.command == 'test-restore':
            test_restore(args.value)
        elif args.command == 'restore':
            restore(args.value)
        elif args.command == 'dns-update':
            dns_update()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # SDK errors can contain request URLs. Keep operator output free of credentials.
        print(f'Falha em {type(error).__name__}: operação interrompida.', file=sys.stderr)
        if isinstance(error, (ValueError, RuntimeError, FileNotFoundError)):
            print(str(error), file=sys.stderr)
        elif hasattr(error, 'status'):
            print(f'OCI HTTP {error.status}, code={getattr(error, "code", "unknown")}', file=sys.stderr)
        sys.exit(1)
