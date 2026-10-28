import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { UserRepository as Before } from './fixtures/opt08/users.before.repo.js';
import { movementsQuery, movementsCountQuery } from '../src/modules/users/repo/movementsRead.repo.js';
import { PinService } from '../src/modules/auth/service/pin.service.js';

process.env.KEYCLOAK_ISSUER = 'https://identity.example/realms/test';
const syntheticIdentity = 'synthetic';

test('recent activity preserves frozen DTO, null fallbacks and type priority even with overlapping children', async () => {
    const rows = [], original = [];
    for (let mask = 0; mask < 8; mask++) for (const name of [null, '', 'Corrección Ñ']) {
        const id = rows.length + 1, date = new Date('2024-09-08T04:00:00Z');
        rows.push({ id, dateTime: date, observacion: '  Nota general  ', paymentId: mask & 1 ? id : null,
            stageId: mask & 2 ? id : null, subprocessId: mask & 4 ? id : null, paymentName: name, stageName: name, subprocessName: name });
        original.push({ ID_REGISTRO: id, FECHA_HORA: date, observacion: '  Nota general  ',
            Registro_Pago: mask & 1 ? { Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago: name == null ? null : { nombre_estado_pago: name } } : null,
            Registro_Etapas: mask & 2 ? { Estado_Pedido: name == null ? null : { nombre_etapa: name } } : null,
            registro_subprocesos: mask & 4 ? { Estado_Subprocesos: name == null ? null : { nombre_estado: name } } : null });
    }
    const before = new Before({ prisma: { registros: { findMany: async () => original } } });
    const after = new UserRepository({ prisma: { $queryRaw: async () => rows } });
    assert.deepEqual(await after.listRecentRecords(7), await before.listRecentRecords(7));
    assert.equal((await after.listRecentRecords(7)).length, 24);
});

test('list and count start independently; empty/deep page retains the exact total', async () => {
    let resolvePage, resolveCount;
    const calls = [];
    const repo = new UserRepository({ prisma: { $queryRaw: q => {
        calls.push(q); return new Promise(resolve => { if (q.sql.includes('COUNT(*)')) resolveCount = resolve; else resolvePage = resolve; });
    } } });
    const work = repo.listMovements(9, { page: 500, perPage: 10 });
    assert.equal(calls.length, 2); resolvePage([]); resolveCount([{ total: 81n }]);
    assert.deepEqual(await work, { records: [], total: 81, page: 500, perPage: 10 });
    for (const query of calls) assert.equal(query.values[0], 9);
});

for (const search of ['', 'Estado de pago: Parcial', 'Etapa del pedido: Diseño', 'Subproceso: ', '12', '999999999999999999999', "%_\\' OR 1=1 --", 'ñ']) {
    test(`page/count bind identical search and owner predicates: ${search}`, () => {
        const page = movementsQuery(7, { page: 3, perPage: 10, search }), count = movementsCountQuery(7, { search });
        assert.deepEqual(page.values.slice(0, -2), count.values);
        assert.deepEqual(page.values.slice(-2), [10, 20]);
        assert.match(page.sql, /ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC/);
        assert.equal(page.values[0], 7); assert(!page.sql.includes('OR 1=1 --'));
        if (search) assert.match(count.sql, /LEFT JOIN/); else assert(!count.sql.includes('JOIN'));
    });
}

test('invalid owner never issues SQL; database failures remain failures', async () => {
    let calls = 0;
    const repo = new UserRepository({ prisma: { $queryRaw: async () => { calls++; throw Error('SQL unavailable'); } } });
    for (const id of [null, 0, -1, '7', 1.5]) {
        await assert.rejects(repo.listRecentRecords(id), { code: 'USER_NOT_FOUND' });
        await assert.rejects(repo.listMovements(id, { page: 1, perPage: 10 }), { code: 'USER_NOT_FOUND' });
    }
    assert.equal(calls, 0); await assert.rejects(repo.listRecentRecords(7), /SQL unavailable/);
});

function pinFixture({ accepted = false, active = true, failWrite = false } = {}) {
    const secret = Buffer.alloc(32, 3).toString('base64');
    const pins = new PinService({ secret });
    const encrypted = pins.encrypt('314159');
    const row = { id_usuario: 7, estado_usuario: active ? 'Activo' : 'Desvinculado', pin_hash: 'synthetic-hash',
        pin_salt: 'synthetic-salt', pin_accepted_at: accepted ? new Date() : null,
        pin_pending_ciphertext: encrypted.ciphertext, pin_pending_iv: encrypted.iv, pin_pending_tag: encrypted.tag,
        correo_usuario: 'private@example.invalid', unrelated: 'private' };
    const selections = []; let writes = 0;
    pins.prisma = { usuario: { findFirst: async ({ select }) => {
        selections.push(select); return select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : { ...row };
    }, update: async ({ data }) => { if (failWrite) throw Error('SQL unavailable'); writes++; Object.assign(row, data); } } };
    return { pins, row, selections, writes: () => writes };
}

test('PIN reveal decrypts only pending data, without reading hash, salt or profile columns', async () => {
    const f = pinFixture(); assert.equal(await f.pins.reveal(syntheticIdentity), '314159');
    assert(!f.selections[0].pin_hash); assert(!f.selections[0].correo_usuario);
    assert.equal(f.writes(), 0);
});
test('acknowledge is durable and repeatable; accepted data cannot be revealed again', async () => {
    const f = pinFixture(); await f.pins.acknowledge(syntheticIdentity);
    assert.equal(f.writes(), 1); assert(f.row.pin_accepted_at); assert.equal(f.row.pin_pending_ciphertext, null);
    await f.pins.acknowledge(syntheticIdentity); assert.equal(f.writes(), 1);
    await assert.rejects(f.pins.reveal(syntheticIdentity), { code: 'PIN_NOT_REVEALABLE' });
    assert(f.selections.every(s => !s.pin_salt && !s.correo_usuario));
});
test('failed receipt never clears pending data; disabled users cannot reveal, acknowledge or rotate', async () => {
    const f = pinFixture({ failWrite: true }); await assert.rejects(f.pins.acknowledge(syntheticIdentity), /SQL unavailable/);
    assert.equal(f.row.pin_accepted_at, null); assert(f.row.pin_pending_ciphertext); assert.equal(f.writes(), 0);
    const g = pinFixture({ active: false });
    for (const action of [() => g.pins.reveal(syntheticIdentity), () => g.pins.acknowledge(syntheticIdentity), () => g.pins.rotateAfterRecovery(syntheticIdentity, () => assert.fail())]) {
        await assert.rejects(action(), { code: 'PIN_USER_UNAVAILABLE' });
    }
    assert.equal(g.writes(), 0);
});
test('status provisioning reads fresh state and preserves pending/active distinction', async () => {
    for (const accepted of [true, false]) {
        const f = pinFixture({ accepted });
        assert.equal(await f.pins.ensureProvisioned(syntheticIdentity), accepted ? 'active' : 'pending_acknowledgement');
        assert.deepEqual(Object.keys(f.selections[0]).sort(), ['estado_usuario', 'id_usuario', 'pin_accepted_at', 'pin_hash']);
    }
});
