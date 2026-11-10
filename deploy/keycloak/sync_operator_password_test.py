#!/usr/bin/env python3
"""Regression tests for private Keycloak operator credential synchronization."""

import contextlib
import fcntl
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SOURCE = Path(__file__).with_name('sync-operator-password.py')
SPEC = importlib.util.spec_from_file_location('operator_rotation', SOURCE)
rotation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rotation)

OLD_PASSWORD = 'old-operator-password-for-testing'
NEW_PASSWORD = 'new-operator-password-for-testing'
ORIGIN = 'https://example.invalid'


class OperatorRotationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name)
        self.root = base / 'source'
        (self.root / 'deploy/mysql/private').mkdir(parents=True)
        self.config_dir = base / 'private-config'
        self.config_dir.mkdir(mode=0o700)
        self.env_file = self.config_dir / 'deploy.env'
        self.env_file.write_text(
            'KEYCLOAK_OPERATOR_USERNAME=operator\n'
            f'KEYCLOAK_OPERATOR_PASSWORD="{OLD_PASSWORD}"\n'
            f'PUBLIC_ORIGIN={ORIGIN}\n'
            'LAN_CA_FILE=/private/ca.pem\n', encoding='utf-8')
        self.env_file.chmod(0o600)
        self.admin_file = self.config_dir / 'keycloak-admin.json'
        self.admin_file.write_text(json.dumps({
            'username': 'operator', 'url': ORIGIN + '/admin/master/console/',
            'password': OLD_PASSWORD,
        }) + '\n', encoding='utf-8')
        self.admin_file.chmod(0o600)
        self.env_before = self.env_file.read_bytes()
        self.admin_before = self.admin_file.read_bytes()

    def deployment(self, root, env_file):
        self.assertEqual((root, env_file), (self.root, self.env_file))
        entry = next(line for line in env_file.read_text().splitlines()
                     if line.startswith('KEYCLOAK_OPERATOR_PASSWORD='))
        return {
            'KEYCLOAK_OPERATOR_USERNAME': 'operator',
            'KEYCLOAK_OPERATOR_PASSWORD': entry.split('=', 1)[1].strip('"\''),
            'PUBLIC_ORIGIN': ORIGIN, 'LAN_CA_FILE': '/private/ca.pem',
        }

    def test_quotes_and_unique_line(self):
        password = "long-password-with-a-single-quote'"
        updated = rotation.replace_env_password(
            '# preserved\n\n  export KEYCLOAK_OPERATOR_PASSWORD = previous\n', password)
        self.assertEqual(updated, '# preserved\n\n  export KEYCLOAK_OPERATOR_PASSWORD = '
                         f'"{password}"\n')
        with self.assertRaises(rotation.Refused):
            rotation.encoded_password('long-password-with-both-\'"-quotes')
        with self.assertRaises(rotation.Refused):
            rotation.replace_env_password(
                'KEYCLOAK_OPERATOR_PASSWORD=a\nKEYCLOAK_OPERATOR_PASSWORD=b\n',
                NEW_PASSWORD)

    def test_rejected_keycloak_password_does_not_change_private_files(self):
        with mock.patch.object(rotation, 'read_deployment', side_effect=self.deployment), \
             mock.patch.object(rotation, 'authenticate', side_effect=rotation.Refused('REJECTED')):
            with self.assertRaisesRegex(rotation.Refused, 'REJECTED'):
                rotation.synchronize(self.root, self.env_file, self.admin_file, NEW_PASSWORD)
        self.assertEqual(self.env_file.read_bytes(), self.env_before)
        self.assertEqual(self.admin_file.read_bytes(), self.admin_before)
        self.assertFalse((self.config_dir / 'operator-rotation-verify.log').exists())

    def test_sync_releases_lock_before_verify_and_keeps_files_private(self):
        calls = []

        def verify(command, **kwargs):
            self.assertEqual(command[2:], ['verify', '--env-file', str(self.env_file)])
            with open(self.root / 'deploy/mysql/private/operation.lock', 'w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            calls.append(command)
            kwargs['stdout'].write('verified\n')
            return mock.Mock(returncode=0)

        with mock.patch.object(rotation, 'read_deployment', side_effect=self.deployment), \
             mock.patch.object(rotation, 'authenticate') as authenticate, \
             mock.patch.object(rotation.subprocess, 'run', side_effect=verify), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            rotation.synchronize(self.root, self.env_file, self.admin_file, NEW_PASSWORD)
        authenticate.assert_called_once_with(ORIGIN, Path('/private/ca.pem'),
                                             'operator', NEW_PASSWORD)
        self.assertEqual(len(calls), 1)
        self.assertIn('DEPLOYMENT_VERIFY_OK', output.getvalue())
        self.assertIn(f'KEYCLOAK_OPERATOR_PASSWORD=\'{NEW_PASSWORD}\'',
                      self.env_file.read_text())
        self.assertEqual(json.loads(self.admin_file.read_text())['password'], NEW_PASSWORD)
        for path in (self.env_file, self.admin_file,
                     self.config_dir / 'operator-rotation-verify.log'):
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
