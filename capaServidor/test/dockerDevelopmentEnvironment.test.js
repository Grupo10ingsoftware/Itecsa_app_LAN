import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerDatabaseUrl } from '../scripts/dockerDevelopmentEnvironment.mjs';

const env = {
  DATABASE_URL: 'mysql://user:example%40password@db.example:3306/application?sslcert=.%2Fcerts%2Fca.pem&sslaccept=strict&connection_limit=5',
  DB_SSL_CA_PATH: '/run/secrets/mysql-lab-ca.pem',
};

test('changes only the CA path for the existing Docker secret', () => {
  const before = new URL(env.DATABASE_URL), after = new URL(dockerDatabaseUrl(env));
  assert.equal(after.searchParams.get('sslcert'), env.DB_SSL_CA_PATH);
  after.searchParams.set('sslcert', before.searchParams.get('sslcert'));
  assert.equal(after.href, before.href);
  assert.equal(new URL(dockerDatabaseUrl({ ...env, DATABASE_URL: dockerDatabaseUrl(env) })).href, dockerDatabaseUrl(env));
});

test('does not repair missing, weak or duplicated TLS settings', () => {
  for (const query of ['sslaccept=accept_invalid_certs&sslcert=old', 'sslaccept=strict', 'sslaccept=strict&sslcert=a&sslcert=b', 'sslaccept=strict&sslaccept=accept_invalid_certs&sslcert=a']) {
    const DATABASE_URL = 'mysql://user:password@db.example/application?' + query;
    assert.equal(dockerDatabaseUrl({ ...env, DATABASE_URL }), DATABASE_URL);
  }
});

test('does not add TLS or invent connection configuration', () => {
  assert.equal(dockerDatabaseUrl({}), undefined);
  assert.equal(dockerDatabaseUrl({ ...env, DB_SSL_MODE: 'disabled' }), env.DATABASE_URL);
});
