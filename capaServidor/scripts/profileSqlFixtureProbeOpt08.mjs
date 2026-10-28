import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';

// CTEs shadow every source table for this SELECT only. No CREATE/INSERT/UPDATE.
export async function verifyProfileSqlFixtures(db) {
    const date = new Date('2024-09-08T04:00:00Z');
    const events = Array.from({ length: 53 }, (_, i) => ({ id: i + 1, owner: i < 43 ? 1 : 2,
        observation: i === 0 ? '  \u00a0Nota general\n' : i === 1 ? null : 'Evento sintético' }));
    const records = events.map(e => Prisma.sql`SELECT ${e.id} AS ID_REGISTRO, ${e.owner} AS id_usuario,
        CAST('2024-09-08 04:00:00' AS DATETIME) AS FECHA_HORA, ${e.observation} AS observacion`);
    const tables = Prisma.sql`WITH Registros AS (${Prisma.join(records, ' UNION ALL ')}),
        Registro_Pago AS (SELECT 3 AS id_registro, 1 AS id_estado_pago_nuevo UNION ALL SELECT 4, NULL),
        Estado_Pago AS (SELECT 1 AS id_estado_pago, 'Pago sintético' AS nombre_estado_pago),
        Registro_Etapas AS (SELECT 3 AS id_registro, 1 AS id_estado_pedido UNION ALL SELECT 5, NULL),
        Estado_Pedido AS (SELECT 1 AS id_estado_pedido, 'Etapa sintética' AS nombre_etapa),
        registro_subprocesos AS (SELECT 3 AS id_registro, 1 AS id_estado_subproceso UNION ALL SELECT 6, NULL),
        Estado_Subprocesos AS (SELECT 1 AS id_estado_subproceso, 'Subproceso sintético' AS nombre_estado)`;
    const repo = new UserRepository({ prisma: { $queryRaw: q => db.$queryRaw(Prisma.sql`${tables} ${q}`) } });
    const expected = events.filter(e => e.owner === 1).reverse().map(e => ({ id: e.id, dateTime: date,
        detail: e.id === 3 ? 'Estado de pago: Pago sintético' : e.id === 4 ? 'Estado de pago: No informado'
            : e.id === 5 ? 'Etapa del pedido: No informada' : e.id === 6 ? 'Subproceso: No informado'
                : e.observation?.trim() || 'Actividad del pedido' }));
    const visited = [];
    for (let page = 1; page <= 6; page++) {
        const value = await repo.listMovements(1, { page, perPage: 10 });
        assert.equal(value.total, 43); assert.deepEqual(value.records, expected.slice((page - 1) * 10, page * 10)); visited.push(...value.records);
    }
    assert.deepEqual(visited, expected); assert.equal(new Set(visited.map(r => r.id)).size, 43);
    assert.deepEqual(await repo.listRecentRecords(1), expected.slice(0, 10));
    for (const [search, ids] of [['Nota general', [1]], ['Estado de pago: Pago sintético', [3]], ['Etapa del pedido: Etapa sintética', [3]],
        ['Subproceso: Subproceso sintético', [3]], ["' OR 1=1 --", []], ['99999999', []], ['53', []]]) {
        const value = await repo.listMovements(1, { page: 1, perPage: 10, search });
        assert.deepEqual(value.records.map(r => r.id), ids); assert.equal(value.total, ids.length);
        if (ids[0] === 3) assert.equal(value.records[0].detail, 'Estado de pago: Pago sintético');
    }
    const foreign = await repo.listMovements(2, { page: 1, perPage: 10 });
    assert.equal(foreign.total, 10); assert(foreign.records.every(r => r.id > 43));
    return { cteOnly: true, writes: 0, records: 53, ownerOne: 43, ownerTwo: 10, pages: 6,
        tiedTimestampsNoLoss: true, nullableStates: true, overlappingChildrenPreservePriority: true,
        searchUsesAllRelations: true, exactTotalsIncludingEmptyPage: true, identityIsolation: true, assertions: 34 };
}
