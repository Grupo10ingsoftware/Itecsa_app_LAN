import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createGetProfileHandler } from '../src/modules/auth/controller/auth.controller.js';
import { ACCOUNT_CREATED_AT_CLAIM } from '../../shared/identityProfile.js';

const createdAt = Date.parse('2026-01-15T12:30:00.123Z');
const issuedAt = Math.floor(Date.parse('2026-11-09T12:00:00.000Z') / 1000);
const subject = 'profile-date-fixture';
const publicProfile = {
    primerNombre: 'Cuenta', apellidoPaterno: 'Prueba', email: 'profile@example.test',
    rolUsuario: 'Soporte', rutUsuario: '11111111-1', estadoUsuario: 'Activo',
};
const records = [{ id: 37, detail: 'Movimiento de prueba', dateTime: '2026-10-20T16:00:00.000Z' }];

// Exercise the real HTTP handler with the identity middleware's authenticated
// request fixture and a repository double. This does not verify JWT signatures
// or connect to a database; real Keycloak issuance is checked separately.
async function profileServer(t, { payload = {}, user = {}, currentUser = true } = {}) {
    const state = {
        payload: { sub: subject, iat: issuedAt, [ACCOUNT_CREATED_AT_CLAIM]: createdAt, ...payload },
        user: currentUser ? {
            idUsuario: 42, identitySubject: subject,
            nombreUsuario: publicProfile.primerNombre, apellidoUsuario: publicProfile.apellidoPaterno,
            correoUsuario: publicProfile.email, rolUsuario: publicProfile.rolUsuario,
            rutUsuario: publicProfile.rutUsuario, estadoUsuario: publicProfile.estadoUsuario,
            ...user,
        } : undefined,
        requestedUsers: [],
    };
    const app = express();
    app.get('/api/auth/profile', (req, res, next) => {
        req.auth = { payload: state.payload };
        req.currentUser = state.user;
        req.identityProvider = 'keycloak';
        next();
    }, createGetProfileHandler({
        users: {
            async listRecentRecords(idUsuario) {
                state.requestedUsers.push(idUsuario);
                return structuredClone(records);
            },
        },
    }));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
    }));
    await once(server, 'listening');
    return {
        state,
        async get() {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/profile`);
            return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
        },
    };
}

test('profile returns the persisted account creation instant as ISO UTC and preserves its public contract', async t => {
    const fixture = await profileServer(t);
    const response = await fixture.get();
    assert.equal(response.status, 200);
    assert.equal(response.cache, 'no-store');
    assert.deepEqual(response.body, { ...publicProfile, fechaRegistro: '2026-01-15T12:30:00.123Z', records });
    assert.deepEqual(fixture.state.requestedUsers, [42]);
});

test('registration date stays the same when a new access token has a later iat or auth_time', async t => {
    const fixture = await profileServer(t, { payload: { auth_time: issuedAt - 60 } });
    const first = await fixture.get();
    fixture.state.payload.iat += 3600;
    fixture.state.payload.auth_time += 3600;
    const later = await fixture.get();
    assert.equal(first.status, 200);
    assert.equal(later.status, 200);
    assert.equal(first.body.fechaRegistro, '2026-01-15T12:30:00.123Z');
    assert.equal(later.body.fechaRegistro, first.body.fechaRegistro);
    assert.deepEqual(fixture.state.requestedUsers, [42, 42]);
});

test('missing creation claim does not fall back to token, local user or movement dates', async t => {
    const fixture = await profileServer(t, {
        payload: { [ACCOUNT_CREATED_AT_CLAIM]: undefined, auth_time: issuedAt - 60 },
        user: { createdAt: '2026-01-10T10:00:00Z', fechaRegistro: '2026-01-11T10:00:00Z',
            pin_created_at: '2026-01-12T10:00:00Z' },
    });
    const response = await fixture.get();
    assert.equal(response.status, 200);
    assert.equal(response.body.fechaRegistro, null);
    assert.deepEqual(response.body.records, records);
    assert.equal(response.cache, 'no-store');
});

for (const [label, value] of [
    ['null', null], ['numeric string', String(createdAt)], ['fractional millisecond', createdAt + 0.5],
    ['negative', -1], ['zero', 0], ['out of supported year range', 253402300800000],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1], ['not a number', NaN],
    ['infinity', Infinity], ['boolean', true], ['object', {}],
    ['creation after token issuance', (issuedAt + 1) * 1000],
]) {
    test(`profile keeps an unknown date for ${label} creation claim`, async t => {
        const fixture = await profileServer(t, { payload: { [ACCOUNT_CREATED_AT_CLAIM]: value } });
        const response = await fixture.get();
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { ...publicProfile, fechaRegistro: null, records });
        assert.equal(response.cache, 'no-store');
    });
}

for (const [label, value] of [
    ['missing', undefined], ['numeric string', String(issuedAt)], ['fractional', issuedAt + 0.5],
    ['negative', -1], ['not a number', NaN],
]) {
    test(`profile keeps an unknown date when token iat is ${label}`, async t => {
        const fixture = await profileServer(t, { payload: { iat: value } });
        const response = await fixture.get();
        assert.equal(response.status, 200);
        assert.equal(response.body.fechaRegistro, null);
    });
}

test('creation milliseconds within the token issuance second are valid', async t => {
    const fixture = await profileServer(t, { payload: { iat: Math.floor(createdAt / 1000) } });
    const response = await fixture.get();
    assert.equal(response.status, 200);
    assert.equal(response.body.fechaRegistro, '2026-01-15T12:30:00.123Z');
});

test('a mismatched identity cannot read another user profile or records', async t => {
    const fixture = await profileServer(t, { payload: { sub: 'different-subject-fixture' } });
    const response = await fixture.get();
    assert.equal(response.status, 401);
    assert.equal(response.cache, 'no-store');
    assert.deepEqual(response.body, { message: 'Sesión no válida.' });
    assert.deepEqual(fixture.state.requestedUsers, []);
});

test('missing local user cannot read profile or records', async t => {
    const fixture = await profileServer(t, { currentUser: false });
    const response = await fixture.get();
    assert.equal(response.status, 401);
    assert.equal(response.cache, 'no-store');
    assert.deepEqual(response.body, { message: 'Sesión no válida.' });
    assert.deepEqual(fixture.state.requestedUsers, []);
});

test('profile never copies private identity or local security fields into its response', async t => {
    const fixture = await profileServer(t, {
        payload: { preferred_username: 'fixture-name', session_state: 'private-session-fixture',
            auth_time: issuedAt, permissions: ['private-permission-fixture'] },
        user: { pin_hash: 'synthetic-pin-hash-fixture', pin_salt: 'synthetic-pin-salt-fixture',
            passwordHash: 'synthetic-password-hash-fixture', provisionedAt: '2026-10-01T00:00:00Z' },
    });
    const response = await fixture.get();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ...publicProfile, fechaRegistro: '2026-01-15T12:30:00.123Z', records });
    for (const key of ['sub', 'identitySubject', 'iat', 'auth_time', 'session_state', 'permissions',
        ACCOUNT_CREATED_AT_CLAIM, 'pin_hash', 'pin_salt', 'passwordHash', 'provisionedAt']) {
        assert.equal(Object.hasOwn(response.body, key), false, `private field ${key} must stay private`);
    }
});
