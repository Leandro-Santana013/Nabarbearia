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


class SnapshotTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix', 'Release links are tested on Linux')
    def test_failed_release_restores_previous_database_and_application(self):
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
                stack.enter_context(patch.object(operations, 'wait_health', side_effect=[RuntimeError('new version unhealthy'), None]))
                stack.enter_context(patch.object(operations.shutil, 'chown', create=True))
                with self.assertRaisesRegex(RuntimeError, 'new version unhealthy'):
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
