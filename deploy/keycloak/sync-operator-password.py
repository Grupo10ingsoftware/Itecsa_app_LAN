#!/usr/bin/env python3
"""Synchronize a rotated Keycloak operator password with private deployment files.

The password is read from the terminal (or stdin with --password-stdin), never
from an argument. This script does not change the password in Keycloak: the
operator must first rotate it in the master realm's administration console.
"""

import argparse
import fcntl
import getpass
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def private_text(path):
    info = path.lstat()
    require(path.is_file() and not path.is_symlink() and info.st_uid == os.getuid()
            and not (info.st_mode & 0o077) and info.st_size < 1024 * 1024,
            'PRIVATE_FILE_INVALID')
    return path.read_text(encoding='utf-8')


def encoded_password(password):
    require(len(password) >= 20 and not any(char in password for char in '\r\n\x00')
            and not re.search(r'<[^>]+>', password), 'PASSWORD_POLICY_INVALID')
    quote = "'" if "'" not in password else ('"' if '"' not in password else None)
    require(quote is not None, 'PASSWORD_NOT_SERIALIZABLE_IN_DEPLOY_ENV')
    return quote + password + quote


def replace_env_password(before, password):
    matches = list(re.finditer(
        r'(?m)^([ \t]*(?:export[ \t]+)?KEYCLOAK_OPERATOR_PASSWORD[ \t]*=[ \t]*)[^\r\n]*$', before))
    require(len(matches) == 1, 'OPERATOR_CONFIG_KEY_NOT_UNIQUE')
    match = matches[0]
    return before[:match.start()] + match.group(1) + encoded_password(password) + before[match.end():]


def atomic_replace(path, before, after):
    if before == after:
        return
    require(private_text(path) == before, 'FILE_CHANGED_DURING_ROTATION')
    descriptor, temporary = tempfile.mkstemp(prefix='.operator-rotation-', dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            stream.write(after)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_deployment(root, env_file):
    script = """import {readEnvironment} from './deploy/mysql/environment.mjs';
      const e=readEnvironment(process.argv[1]);
      console.log(JSON.stringify(Object.fromEntries(['KEYCLOAK_OPERATOR_USERNAME',
        'KEYCLOAK_OPERATOR_PASSWORD','PUBLIC_ORIGIN','LAN_CA_FILE'].map(k=>[k,e[k]]))));"""
    result = subprocess.run(['node', '--input-type=module', '-e', script, str(env_file)],
                            cwd=root, capture_output=True, text=True)
    require(result.returncode == 0, 'DEPLOYMENT_CONFIG_PARSE_FAILED')
    value = json.loads(result.stdout)
    require(all(isinstance(value.get(key), str) and value[key] for key in
                ('KEYCLOAK_OPERATOR_USERNAME', 'KEYCLOAK_OPERATOR_PASSWORD',
                 'PUBLIC_ORIGIN', 'LAN_CA_FILE')), 'DEPLOYMENT_CONFIG_INCOMPLETE')
    return value


def authenticate(origin, ca_file, username, password):
    require(bool(re.fullmatch(r'https://(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])', origin)),
            'PUBLIC_ORIGIN_INVALID')
    context = ssl.create_default_context(cafile=str(ca_file))
    token_url = origin + '/realms/master/protocol/openid-connect/token'
    request = urllib.request.Request(token_url, data=urllib.parse.urlencode({
        'grant_type': 'password', 'client_id': 'admin-cli',
        'username': username, 'password': password,
    }).encode(), method='POST')
    try:
        with urllib.request.urlopen(request, timeout=15, context=context) as response:
            body = json.load(response)
            require(response.status == 200 and isinstance(body.get('access_token'), str)
                    and bool(body['access_token']), 'NEW_PASSWORD_NOT_ACCEPTED_BY_KEYCLOAK')
    except urllib.error.HTTPError as error:
        if error.code in (400, 401):
            raise Refused('NEW_PASSWORD_NOT_ACCEPTED_BY_KEYCLOAK') from None
        raise Refused('KEYCLOAK_HTTP_ERROR') from None
    except (urllib.error.URLError, OSError, ValueError):
        raise Refused('KEYCLOAK_CONNECTION_FAILED') from None


def synchronize(root, env_file, admin_file, password):
    require(root.is_dir() and env_file.is_absolute() and admin_file.is_absolute()
            and env_file.parent == admin_file.parent, 'EXPECTED_PRIVATE_PATHS_REQUIRED')
    config_dir = env_file.parent
    info = config_dir.lstat()
    require(config_dir.is_dir() and not config_dir.is_symlink()
            and info.st_uid == os.getuid() and not (info.st_mode & 0o077),
            'PRIVATE_DIRECTORY_INVALID')
    encoded_password(password)
    lock_path = root / 'deploy/mysql/private/operation.lock'
    lock = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = private_text(env_file)
        deployment = read_deployment(root, env_file)
        auxiliary_before = private_text(admin_file)
        auxiliary = json.loads(auxiliary_before)
        origin = deployment['PUBLIC_ORIGIN']
        username = deployment['KEYCLOAK_OPERATOR_USERNAME']
        require(auxiliary.get('username') == username
                and auxiliary.get('url') == origin + '/admin/master/console/',
                'ADMINISTRATOR_FILE_MISMATCH')
        ca_file = Path(deployment['LAN_CA_FILE'])
        if not ca_file.is_absolute():
            ca_file = root / ca_file

        # Prove the console change happened before touching either local file.
        authenticate(origin, ca_file, username, password)
        atomic_replace(env_file, before, replace_env_password(before, password))
        auxiliary['password'] = password
        atomic_replace(admin_file, auxiliary_before,
                       json.dumps(auxiliary, ensure_ascii=False, indent=2) + '\n')

        current = read_deployment(root, env_file)
        confirmed = json.loads(private_text(admin_file))
        require(current['KEYCLOAK_OPERATOR_PASSWORD'] == password
                and confirmed.get('password') == password,
                'POST_ROTATION_CREDENTIAL_MISMATCH')
        print('OPERATOR_CONFIGURATION_SYNCHRONIZED', flush=True)
    finally:
        os.close(lock)

    # manage.sh verify takes the same deployment lock; release ours first.
    log_path = config_dir / 'operator-rotation-verify.log'
    fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as log:
        os.fchmod(log.fileno(), 0o600)
        checked = subprocess.run(['bash', str(root / 'deploy/mysql/manage.sh'),
                                  'verify', '--env-file', str(env_file)],
                                 cwd=root, stdout=log, stderr=subprocess.STDOUT)
    require(checked.returncode == 0, 'DEPLOYMENT_VERIFY_FAILED')
    print('DEPLOYMENT_VERIFY_OK', flush=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description='Sincronizar la clave administrativa ya cambiada en Keycloak')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--admin-file', type=Path, required=True)
    parser.add_argument('--password-stdin', action='store_true', help=argparse.SUPPRESS)
    options = parser.parse_args()
    if options.password_stdin:
        password = sys.stdin.readline().rstrip('\r\n')
    else:
        require(sys.stdin.isatty(), 'INTERACTIVE_TERMINAL_REQUIRED')
        password = getpass.getpass('Nueva contraseña de Keycloak: ')
    synchronize(options.root.resolve(), options.env_file, options.admin_file, password)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except BaseException as error:
        code = str(error) if isinstance(error, Refused) else type(error).__name__
        print('OPERATOR_CONFIGURATION_FAILED code=' + code, file=sys.stderr, flush=True)
        sys.exit(1)
