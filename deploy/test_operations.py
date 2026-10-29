import io
import contextlib
import json
import gzip
import hashlib
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import operations
from email.message import Message
from urllib.error import HTTPError


class AndroidContractTests(unittest.TestCase):
    manifest = {'version_code': 2002, 'version_name': '0.2.2', 'size_bytes': 3,
                'sha256': hashlib.sha256(b'apk').hexdigest()}

    def response(self, status=200, body=None, content_type='application/json', cache='no-store'):
        headers = Message()
        headers['Content-Type'] = content_type
        headers['Cache-Control'] = cache
        response = io.BytesIO(json.dumps(self.manifest).encode() if body is None else body)
        response.status = status
        response.headers = headers
        return response

    def denied(self, code=401):
        return HTTPError('http://localhost/api/v1/staff/android/apk', code, '', {}, None)

    def test_html_fallback_is_rejected_even_with_http_200(self):
        with patch.object(operations.urllib.request, 'urlopen', return_value=self.response(body=b'<html>Site</html>', content_type='text/html')):
            with self.assertRaisesRegex(RuntimeError, 'JSON'):
                operations.verify_android_contract('http://localhost')

    def test_published_release_and_private_download_are_verified(self):
        with patch.object(operations.urllib.request, 'urlopen', side_effect=[self.response(), self.denied()]):
            self.assertEqual(operations.verify_android_contract('http://localhost', self.manifest), self.manifest)

    def test_204_means_unpublished_and_fails_if_a_release_is_expected(self):
        with patch.object(operations.urllib.request, 'urlopen', side_effect=[self.response(204, b''), self.denied()]):
            self.assertIsNone(operations.verify_android_contract('http://localhost'))
        for options in ({'expected': self.manifest}, {'require_published': True}):
            with self.subTest(options=options), patch.object(operations.urllib.request, 'urlopen', return_value=self.response(204, b'')):
                with self.assertRaisesRegex(RuntimeError, '204'):
                    operations.verify_android_contract('http://localhost', **options)

    def test_bad_metadata_cache_and_public_apk_are_rejected(self):
        invalid = [None, [], {**self.manifest, 'version_code': True}, {**self.manifest, 'size_bytes': 0},
                   {**self.manifest, 'version_name': ''}, {**self.manifest, 'sha256': 'invalid'}]
        for value in invalid:
            with self.subTest(value=value), patch.object(operations.urllib.request, 'urlopen', return_value=self.response(body=json.dumps(value).encode())):
                with self.assertRaises(RuntimeError):
                    operations.verify_android_contract('http://localhost')
        for cache in ('public', 'no-store-something'):
            with self.subTest(cache=cache), patch.object(operations.urllib.request, 'urlopen', return_value=self.response(cache=cache)):
                with self.assertRaisesRegex(RuntimeError, 'cache'):
                    operations.verify_android_contract('http://localhost')
        with patch.object(operations.urllib.request, 'urlopen', side_effect=[self.response(), self.response(content_type='application/octet-stream')]):
            with self.assertRaisesRegex(RuntimeError, 'autenticação'):
                operations.verify_android_contract('http://localhost')

    def test_mismatching_release_is_rejected(self):
        with patch.object(operations.urllib.request, 'urlopen', return_value=self.response()):
            with self.assertRaisesRegex(RuntimeError, 'manifesto esperado'):
                operations.verify_android_contract('http://localhost', {**self.manifest, 'version_code': 2003})

    def test_artifacts_must_be_complete_and_match_size_and_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertIsNone(operations.android_artifacts(root))
            apk = root / 'NA-Barbearia-arm64-release.apk'
            apk.write_bytes(b'apk')
            with self.assertRaisesRegex(RuntimeError, 'incompletos'):
                operations.android_artifacts(root)
            manifest = root / 'release.json'
            manifest.write_text(json.dumps(self.manifest))
            self.assertEqual(operations.android_artifacts(root), self.manifest)
            apk.write_bytes(b'bad')
            with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                operations.android_artifacts(root)


class DeliveryTests(unittest.TestCase):
    def test_shared_fixtures(self):
        cases = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/android-release/cases.json').read_text())
        for case in cases:
            with self.subTest(case=case['name']):
                if case['valid']:
                    self.assertGreater(operations.validate_android_manifest(case['value'])['version_code'], 0)
                else:
                    with self.assertRaises(RuntimeError):
                        operations.validate_android_manifest(case['value'])

    def test_package_roundtrip_revision_protocol_and_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'dist').mkdir()
            (root / 'dist/index.html').write_text('web')
            (root / 'backend').write_bytes(b'backend')
            archive = root / 'release.tar.gz'
            operations.package_web(root / 'backend', root / 'dist', 'revision-1', archive)
            self.assertTrue(archive.with_name(archive.name + '.sha256').is_file())
            with tarfile.open(archive) as bundle:
                self.assertEqual(set(bundle.getnames()), {'backend', 'dist', 'dist/index.html', 'REVISION', 'DELIVERY.json'})
            with patch.object(operations, 'RELEASES', root / 'releases'):
                directory = operations.extract_release(archive, 'revision-1')
                with self.assertRaisesRegex(RuntimeError, 'revision mismatch'):
                    operations.extract_release(archive, 'revision-2')
                self.assertFalse((root / 'releases/revision-2').exists())
            (directory / 'dist/index.html').write_text('tampered')
            with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
                operations.verify_delivery(directory, 'revision-1')
            with tarfile.open(archive, 'w:gz') as bundle:
                for path in directory.iterdir():
                    bundle.add(path, arcname=path.name)
            with patch.object(operations, 'RELEASES', root / 'other-releases'):
                with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
                    operations.extract_release(archive, 'revision-1')
                self.assertFalse((root / 'other-releases/revision-1').exists())
            (root / 'dist/private.apk').write_bytes(b'private')
            with self.assertRaisesRegex(RuntimeError, 'Private artifact'):
                operations.package_web(root / 'backend', root / 'dist', 'revision-3', root / 'private.tar.gz')
            self.assertFalse((root / 'private.tar.gz').exists())
            for capability in ({}, {'delivery_protocol': 1}, {'delivery_protocol': True}, {'delivery_protocol': 3}):
                with self.assertRaisesRegex(RuntimeError, 'incompat'):
                    operations.check_helper(capability)
            operations.check_helper({'delivery_protocol': 2})

    def test_android_install_order_validation_and_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            source, target = data / 'prepared', data / 'android'
            source.mkdir()
            target.mkdir()
            old = AndroidContractTests.manifest
            new = {**old, 'version_code': 2003, 'version_name': '0.2.3', 'sha256': hashlib.sha256(b'new').hexdigest()}
            for directory, content, manifest in ((source, b'new', new), (target, b'apk', old)):
                (directory / operations.APK_NAME).write_bytes(content)
                (directory / 'release.json').write_text(json.dumps(manifest))
            original_replace = Path.replace
            order = []
            def replace(path, destination):
                if Path(destination).parent == target:
                    order.append(path.name)
                return original_replace(path, destination)
            with patch.object(operations, 'DATA', data), patch.object(operations.shutil, 'chown', create=True), patch.object(Path, 'replace', replace):
                operations.install_android(source)
            self.assertEqual(order, [operations.APK_NAME, 'release.json'])
            self.assertEqual(operations.android_artifacts(target), new)

            self.assertTrue(any(data.glob('android-backup-*/release.json')))
            # A failed announcement restores the previous complete pair.
            failed = False
            def fail_once(path, destination):
                nonlocal failed
                if path.name == 'release.json' and Path(destination).parent == target and not failed:
                    failed = True
                    raise OSError('announcement failure')
                return original_replace(path, destination)
            (source / operations.APK_NAME).write_bytes(b'apk')
            (source / 'release.json').write_text(json.dumps(old))
            with patch.object(operations, 'DATA', data), patch.object(operations.shutil, 'chown', create=True), patch.object(Path, 'replace', fail_once):
                with self.assertRaisesRegex(OSError, 'announcement failure'):
                    operations.install_android(source)
            self.assertEqual(operations.android_artifacts(target), new)
            (source / operations.APK_NAME).write_bytes(b'bad')
            with patch.object(operations, 'DATA', data):
                with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                    operations.install_android(source)
            self.assertEqual(operations.android_artifacts(target), new)


    def test_incomplete_announcement_blocks_web_deploy_before_service_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / 'android').mkdir()
            (data / 'android/release.json').write_text(json.dumps(AndroidContractTests.manifest))
            with patch.object(operations, 'DATA', data), patch.object(operations, 'run') as service:
                with self.assertRaisesRegex(RuntimeError, 'incompletos'):
                    operations.deploy(data / 'unused.tar.gz', 'revision-1')
                service.assert_not_called()

class SnapshotTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix', 'Release links are tested on Linux')
    def test_failed_release_restores_previous_database_and_application(self):
        self.check_failed_release('health')

    @unittest.skipUnless(os.name == 'posix', 'Release links are tested on Linux')
    def test_invalid_android_contract_restores_previous_database_and_application(self):
        self.check_failed_release('contract')

    def check_failed_release(self, failure):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'app'
            data = Path(temp) / 'data'
            releases = root / 'releases'
            backups = data / 'backups'
            (releases / 'previous-code').mkdir(parents=True)
            backups.mkdir(parents=True)
            (root / 'current').symlink_to(releases / 'previous-code')
            database = data / 'nabarbearia.db'
            with contextlib.closing(sqlite3.connect(database)) as connection:
                connection.executescript('''CREATE TABLE users(id TEXT); CREATE TABLE sessions(id TEXT);
                    CREATE TABLE schema_migrations(version INTEGER, checksum TEXT);
                    INSERT INTO schema_migrations VALUES(1,'original'); INSERT INTO users VALUES('original-user');''')
            archive = Path(temp) / 'release.tar.gz'
            with tarfile.open(archive, 'w:gz') as bundle:
                for name, content in [('backend', b'fake-binary'), ('dist/index.html', b'html'), ('REVISION', b'new-code')]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(content)
                    bundle.addfile(entry, io.BytesIO(content))
            # Produce the exact delivery contract consumed by the installed helper.
            build = Path(temp) / 'build'
            (build / 'dist').mkdir(parents=True)
            (build / 'backend').write_bytes(b'fake-binary')
            (build / 'dist/index.html').write_text('html')
            operations.package_web(build / 'backend', build / 'dist', 'new-code', archive)
            stored = {}
            class Storage:
                def get_bucket(self, *args):
                    return SimpleNamespace(data=SimpleNamespace(public_access_type='NoPublicAccess'))
                def put_object(self, namespace, bucket, name, body):
                    stored[name] = body.read()
                def get_object(self, namespace, bucket, name):
                    return SimpleNamespace(data=SimpleNamespace(content=stored[name]))
            fake_oci = SimpleNamespace(pagination=SimpleNamespace(list_call_get_all_results=lambda *args, **kwargs: SimpleNamespace(data=SimpleNamespace(objects=[]))))
            storage = Storage()
            storage.list_objects = lambda *args, **kwargs: None
            def service(*args):
                if args[:2] == ('systemctl', 'start') and (root / 'current').resolve().name == 'new-code':
                    with sqlite3.connect(database) as connection:
                        connection.execute("INSERT INTO users VALUES('failed-new-version-write')")
            with contextlib.ExitStack() as stack:
                for name, value in {'ROOT':root, 'DATA':data, 'DB':database, 'BACKUPS':backups, 'RELEASES':releases, 'MAINTENANCE':root/'maintenance'}.items():
                    stack.enter_context(patch.object(operations, name, value))
                stack.enter_context(patch.object(operations, 'cloud', return_value=(storage, 'namespace', 'bucket')))
                stack.enter_context(patch.dict('sys.modules', {'oci':fake_oci}))
                stack.enter_context(patch.object(operations, 'run', side_effect=service))
                stack.enter_context(patch.object(operations, 'wait_health', side_effect=[RuntimeError('new version unhealthy'), None] if failure == 'health' else [None, None]))
                stack.enter_context(patch.object(operations, 'verify_android_contract', side_effect=RuntimeError('invalid Android manifest HTML')))
                stack.enter_context(patch.object(operations.shutil, 'chown', create=True))
                with self.assertRaisesRegex(RuntimeError, 'new version unhealthy' if failure == 'health' else 'invalid Android manifest HTML'):
                    operations.deploy(archive, 'new-code')
            self.assertEqual((root / 'current').resolve().name, 'previous-code')
            self.assertFalse((root / 'maintenance').exists())
            with contextlib.closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute('SELECT id FROM users').fetchall(), [('original-user',)])
            remote_snapshot = next(content for name, content in stored.items() if name.endswith('.db.gz'))
            self.assertTrue(gzip.decompress(remote_snapshot).startswith(b'SQLite format 3'))
            manifest = next(json.loads(content) for name, content in stored.items() if name.endswith('.json'))
            self.assertEqual(hashlib.sha256(remote_snapshot).hexdigest(), manifest['sha256'])

    def test_snapshot_includes_live_wal_and_revokes_only_copied_sessions(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.db'
            with contextlib.closing(sqlite3.connect(source)) as connection:
                connection.executescript('''PRAGMA journal_mode=WAL;
                    CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT);
                    CREATE TABLE schema_migrations(version INTEGER, checksum TEXT);
                    INSERT INTO schema_migrations VALUES(1, 'checksum');
                    INSERT INTO users VALUES('retained-user'); INSERT INTO sessions VALUES('old-session');''')
                connection.execute('INSERT INTO users VALUES(?)', ('committed-in-wal',))
                connection.commit()
                self.assertTrue(Path(str(source) + '-wal').exists())
                destination = Path(temp) / 'snapshot.db'
                info = operations.copy_database(source, destination, revoke_sessions=True)
                self.assertEqual(info['counts']['users'], 2)
                self.assertEqual(info['counts']['sessions'], 0)
                self.assertEqual(connection.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 1)
                self.assertEqual(json.loads(json.dumps(info)), info)
                with self.assertRaises(RuntimeError):
                    operations.copy_database(source, destination)

    def test_release_rejects_database_and_archive_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            releases = Path(temp) / 'releases'
            releases.mkdir()
            for index, name in enumerate(['../outside', 'backend/data/nabarbearia.db', 'data.db']):
                archive = Path(temp) / f'{index}.tar.gz'
                with tarfile.open(archive, 'w:gz') as bundle:
                    entry = tarfile.TarInfo(name)
                    entry.size = 1
                    bundle.addfile(entry, io.BytesIO(b'x'))
                with patch.object(operations, 'RELEASES', releases):
                    with self.assertRaises(RuntimeError):
                        operations.extract_release(archive, f'test-{index}')
                self.assertFalse((Path(temp) / 'outside').exists())
                self.assertFalse((releases / f'test-{index}').exists())


if __name__ == '__main__':
    unittest.main()
