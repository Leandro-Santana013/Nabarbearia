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
import urllib.error

ROOT = Path('/opt/nabarbearia')
DATA = Path('/var/lib/nabarbearia')
CONFIG = Path('/etc/nabarbearia')
BACKUPS = DATA / 'backups'
DB = DATA / 'nabarbearia.db'
RELEASES = ROOT / 'releases'
MAINTENANCE = ROOT / 'maintenance'
SERVICE = 'nabarbearia.service'
HELPER_PROTOCOL = 2
APK_NAME = 'NA-Barbearia-arm64-release.apk'


def valid_revision(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', value):
        raise ValueError('Invalid release ID')
    return value


def check_helper(value):
    if not isinstance(value, dict) or type(value.get('delivery_protocol')) is not int or value['delivery_protocol'] != HELPER_PROTOCOL:
        raise RuntimeError('Helper administrativo incompatível; instalação revisada pelo administrador necessária')


def delivery_files(directory):
    """Inventory only application files; never copy arbitrary checkout contents."""
    directory = Path(directory)
    files = [directory / 'backend', directory / 'REVISION']
    files += sorted((directory / 'dist').rglob('*'))
    result = {}
    for path in files:
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RuntimeError('Unsafe delivery file')
        if path.is_file():
            if path.suffix.lower() in {'.apk', '.db', '.sqlite', '.sqlite3', '.p12', '.keystore', '.jks'} or path.name.startswith('.env') or path.name.endswith(('.db-wal', '.db-shm')) or path.name == 'keystore.properties':
                raise RuntimeError('Private artifact in web delivery')
            with path.open('rb') as source:
                result[path.relative_to(directory).as_posix()] = hashlib.file_digest(source, 'sha256').hexdigest()
    if 'dist/index.html' not in result:
        raise RuntimeError('Incomplete release')
    return result


def verify_delivery(directory, release_id):
    directory = Path(directory)
    metadata = json.loads((directory / 'DELIVERY.json').read_text(encoding='utf-8'))
    check_helper(metadata)
    if metadata.get('revision') != valid_revision(release_id) or (directory / 'REVISION').read_text().strip() != release_id:
        raise RuntimeError('Release revision mismatch')
    if metadata.get('files') != delivery_files(directory):
        raise RuntimeError('Release inventory/hash mismatch')


def package_web(backend, dist, release_id, output):
    release_id = valid_revision(release_id)
    backend, dist, output = Path(backend), Path(dist), Path(output)
    if backend.is_symlink() or not backend.is_file() or dist.is_symlink() or not (dist / 'index.html').is_file():
        raise RuntimeError('Incomplete release')
    # Reject links before copytree can dereference them, including directory links.
    if any(path.is_symlink() for path in dist.rglob('*')):
        raise RuntimeError('Unsafe delivery file')
    with tempfile.TemporaryDirectory() as temp:
        staged = Path(temp)
        shutil.copyfile(backend, staged / 'backend')
        shutil.copytree(dist, staged / 'dist')
        (staged / 'REVISION').write_text(release_id + '\n', encoding='utf-8')
        metadata = {'delivery_protocol': HELPER_PROTOCOL, 'revision': release_id, 'files': delivery_files(staged)}
        (staged / 'DELIVERY.json').write_text(json.dumps(metadata, sort_keys=True) + '\n', encoding='utf-8')
        verify_delivery(staged, release_id)
        output.parent.mkdir(parents=True, exist_ok=True)
        # Build beside the destination so replacing it never crosses filesystems.
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as target:
            incoming = Path(target.name)
        try:
            with tarfile.open(incoming, 'w:gz') as bundle:
                for name in ('backend', 'dist', 'REVISION', 'DELIVERY.json'):
                    bundle.add(staged / name, arcname=name)
            incoming.replace(output)
        finally:
            incoming.unlink(missing_ok=True)
    with output.open('rb') as source:
        checksum = hashlib.file_digest(source, 'sha256').hexdigest()
    output.with_name(output.name + '.sha256').write_text(f'{checksum}  {output.name}\n', encoding='utf-8')


def install_android(source):
    """Administrative operation, under the same maintenance lock as web deployment.

    Copy and verify before touching live files. Keep the previous pair for recovery.
    The deploy user gets no new sudo permission for this operation.
    """
    source = Path(source)
    expected = android_artifacts(source)
    if expected is None:
        raise RuntimeError('Nenhum APK e manifesto encontrados no diretório informado')
    target = DATA / 'android'
    target.mkdir(mode=0o750, exist_ok=True)
    android_artifacts(target)  # Refuse to overwrite an already incomplete/corrupt pair.
    backup = Path(tempfile.mkdtemp(prefix='android-backup-', dir=DATA))
    with tempfile.TemporaryDirectory(prefix='.android-incoming-', dir=DATA) as temp:
        incoming = Path(temp)
        for name in (APK_NAME, 'release.json'):
            shutil.copyfile(source / name, incoming / name)
            (incoming / name).chmod(0o640)
            shutil.chown(incoming / name, user='root', group='nabarbearia')
            if (target / name).exists():
                shutil.copyfile(target / name, backup / name)
        if android_artifacts(incoming) != expected:
            raise RuntimeError('Artefatos alterados durante preparação')
        shutil.chown(target, user='root', group='nabarbearia')
        target.chmod(0o750)
        try:
            (incoming / APK_NAME).replace(target / APK_NAME)
            (incoming / 'release.json').replace(target / 'release.json')
            android_artifacts(target)
        except Exception:
            # Withdraw announcement first, then restore APK -> manifest.
            (target / 'release.json').unlink(missing_ok=True)
            for name in (APK_NAME, 'release.json'):
                if (backup / name).is_file():
                    shutil.copyfile(backup / name, incoming / name)
                    (incoming / name).chmod(0o640)
                    shutil.chown(incoming / name, user='root', group='nabarbearia')
                    (incoming / name).replace(target / name)
                else:
                    (target / name).unlink(missing_ok=True)
            raise
    print('Android instalado; cópia anterior privada:', backup)


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


def validate_android_manifest(value):
    if not isinstance(value, dict) or any(type(value.get(key)) not in (int, float) or not 0 < value[key] <= maximum or value[key] % 1 != 0
                                         for key, maximum in (('version_code', 2147483647), ('size_bytes', 9007199254740991))):
        raise RuntimeError('Manifesto Android inválido: versão ou tamanho')
    if not isinstance(value.get('version_name'), str) or not value['version_name'].strip():
        raise RuntimeError('Manifesto Android inválido: nome da versão')
    if not isinstance(value.get('sha256'), str) or not re.fullmatch('[a-f0-9]{64}', value['sha256']):
        raise RuntimeError('Manifesto Android inválido: SHA-256')
    return {key: value[key] for key in ('version_code', 'version_name', 'size_bytes', 'sha256')}


def android_artifacts(directory):
    directory = Path(directory)
    manifest = directory / 'release.json'
    apk = directory / APK_NAME
    if not manifest.exists() and not apk.exists():
        return None
    if not manifest.is_file() or not apk.is_file():
        raise RuntimeError('Artefatos Android incompletos: publique APK e manifesto juntos')
    value = validate_android_manifest(json.loads(manifest.read_text(encoding='utf-8')))
    if apk.stat().st_size != value['size_bytes']:
        raise RuntimeError('Tamanho do APK difere do manifesto')
    with apk.open('rb') as source:
        checksum = hashlib.file_digest(source, 'sha256').hexdigest()
    if checksum != value['sha256']:
        raise RuntimeError('SHA-256 do APK difere do manifesto')
    return value


def verify_android_contract(origin, expected=None, require_published=False):
    origin = origin.rstrip('/')
    request = urllib.request.Request(origin + '/api/v1/staff/android/release', headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=15) as response:
        if 'no-store' not in [part.strip().lower() for part in response.headers.get('Cache-Control', '').split(',')]:
            raise RuntimeError('Manifesto Android permite cache indevido')
        if response.status == 204:
            if expected is not None or require_published:
                raise RuntimeError('Manifesto retornou 204, mas uma versão publicada era esperada')
            value = None
        else:
            if response.status != 200 or response.headers.get_content_type() != 'application/json':
                raise RuntimeError('Manifesto Android deve retornar JSON (200) ou 204; HTML não é válido')
            try:
                value = validate_android_manifest(json.loads(response.read(65537)))
            except (ValueError, UnicodeError) as error:
                raise RuntimeError('Manifesto Android não contém JSON válido') from error
            if expected is not None and value != validate_android_manifest(expected):
                raise RuntimeError('Versão publicada difere do manifesto esperado')
    # No cookie is sent. HTML/login redirects or a public download must never pass.
    try:
        with urllib.request.urlopen(origin + '/api/v1/staff/android/apk', timeout=15):
            raise RuntimeError('APK acessível sem autenticação da equipe')
    except urllib.error.HTTPError as error:
        if error.code not in (401, 403):
            raise RuntimeError('Proteção do APK retornou uma resposta inesperada') from error
    return value


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
    valid_revision(release_id)
    destination = RELEASES / release_id
    if destination.exists():
        raise RuntimeError('Release already exists; use a new revision')
    destination.mkdir(parents=True)
    try:
        with tarfile.open(archive, 'r:gz') as bundle:
            names = set()
            for member in bundle.getmembers():
                parts = Path(member.name).parts
                if member.name in names:
                    raise RuntimeError('Duplicate archive member')
                names.add(member.name)
                if member.issym() or member.islnk() or not (member.isfile() or member.isdir()) or Path(member.name).is_absolute() or '..' in parts:
                    raise RuntimeError('Unsafe archive member')
                if not parts or parts[0] not in {'backend', 'dist', 'REVISION', 'DELIVERY.json'}:
                    raise RuntimeError('Release may only contain backend, dist, REVISION and DELIVERY.json; no database or secrets')
                if parts[0] in {'backend', 'REVISION', 'DELIVERY.json'} and len(parts) != 1:
                    raise RuntimeError('Invalid release layout')
            bundle.extractall(destination, filter='data')
        if not (destination / 'dist/index.html').is_file() or not (destination / 'backend').is_file():
            raise RuntimeError('Incomplete release')
        verify_delivery(destination, release_id)
        (destination / 'backend').chmod(0o755)
        return destination
    except Exception:
        shutil.rmtree(destination)
        raise


def deploy(archive, release_id):
    valid_revision(release_id)
    android_artifacts(DATA / 'android')  # Before maintenance, service stop or backup.
    if not DB.is_file():
        raise RuntimeError('Import the initial database before publishing')
    if revision() == release_id and health():
        verify_delivery(ROOT / 'current', release_id)
        verify_android_contract('http://127.0.0.1:3001', android_artifacts(DATA / 'android'))
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
        verify_android_contract('http://127.0.0.1:3001', android_artifacts(DATA / 'android'))
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
    install = sub.add_parser('install-android')
    install.add_argument('directory', type=Path)
    sub.add_parser('capabilities')
    helper = sub.add_parser('check-helper')
    helper.add_argument('path', type=Path)
    package = sub.add_parser('package-web')
    package.add_argument('--backend', type=Path, required=True)
    package.add_argument('--dist', type=Path, required=True)
    package.add_argument('--revision', required=True)
    package.add_argument('--output', type=Path, required=True)
    sub.add_parser('backup')
    sub.add_parser('dns-update')
    verify = sub.add_parser('verify-release')
    verify.add_argument('--origin', required=True)
    verify.add_argument('--android-dir', type=Path)
    verify.add_argument('--require-published', action='store_true')
    args = parser.parse_args()
    if args.command == 'capabilities':
        print(json.dumps({'delivery_protocol': HELPER_PROTOCOL}))
        return
    if args.command == 'check-helper':
        check_helper(json.loads(args.path.read_text(encoding='utf-8')))
        return
    if args.command == 'package-web':
        package_web(args.backend, args.dist, args.revision, args.output)
        return
    if args.command == 'verify-release':
        expected = android_artifacts(args.android_dir) if args.android_dir else None
        if args.android_dir and expected is None:
            raise RuntimeError('Nenhum APK e manifesto encontrados no diretório informado')
        value = verify_android_contract(args.origin, expected, args.require_published)
        print('Manifesto e proteção do APK verificados:' if value else 'Contrato verificado; nenhum APK anunciado (204).',
              json.dumps(value) if value else '')
        return
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
        elif args.command == 'install-android':
            install_android(args.directory)
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
