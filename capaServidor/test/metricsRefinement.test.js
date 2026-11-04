import test from 'node:test';
import assert from 'node:assert/strict';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import { reportOrdersQuery, readReportOrders } from '../src/modules/metrics/repo/metricsRead.repo.js';
import { readReportOrders as beforeRead } from './fixtures/opt07/second-pass/metricsRead.before.repo.js';
import { range, period, volumeFixture } from './fixtures/opt07/second-pass/reportFixture.js';

test('report query selects the first exact ready event without skipping null entries or restricting its date', () => {
 const query=reportOrdersQuery(range);
 assert.match(query.sql,/first_s.id_estado_pedido=\?/);
 assert.match(query.sql,/ORDER BY first_r.FECHA_HORA,first_r.ID_REGISTRO LIMIT 1/);
 assert.doesNotMatch(query.sql,/first_e.fecha_hora_entrada\s*(?:IS NOT NULL|>=|<)/);
 assert.deepEqual(query.values,[range.start,range.end,4]);
 assert.doesNotMatch(query.sql,/2024-09|SELECT\s+\*/i);
});

for (const [orders, events] of [[0,0],[1,1],[30,50],[1000,20]]) {
 test(`same complete summary for ${orders} orders and ${events} ready reentries per order`,async()=>{
  const {rows,reducedRows}=volumeFixture(orders,events);
  const fixed={production:async()=>({Lanyard:901,lanyard:3}),dwellTime:async()=>({stages:[],subprocesses:[]})};
  const before=await new MetricsService({repo:{...fixed,reportOrders:async()=>{ const orders=await beforeRead({$queryRaw:async()=>rows},range); for(const order of orders) for(const event of order.Registros) event.Registro_Etapas.Estado_Pedido.id_estado_pedido=4; return orders; }}}).summary(period);
  const after=await new MetricsService({repo:{...fixed,reportOrders:()=>readReportOrders({$queryRaw:async()=>reducedRows},range)}}).summary(period);
  assert.deepEqual(after,before);
  assert.equal(after.flowTime.length,orders);
  if(orders>=3)assert.equal(after.flowTime[2].readyForDeliveryAt,null);
 });
}
