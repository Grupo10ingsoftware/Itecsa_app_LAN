import assert from 'node:assert/strict';
import test from 'node:test';
import { yoyoRepository } from '../../capaServidor/test/fixtures/yoyo.js';
import { completeSubprocessOperation } from '../../capaServidor/src/modules/orders/repo/orderSubprocessOperations.js';
import { parseKanbanOrderDetailDTO } from '../src/modules/orders/utils/orderDto.js';
import { normalizeOrder } from '../src/modules/kanban/utils/kanbanOrderMapping.js';
import { getOrderItems, isLanyardPackagingBlocked } from '../src/modules/kanban/utils/kanbanDetail.js';
import { isItemReadyForDelivery, orderMatchesFilters, isLanyardItem } from '../src/modules/kanban/utils/kanbanOrderRules.js';

const uiOrder = s => normalizeOrder(parseKanbanOrderDetailDTO(JSON.parse(JSON.stringify(s.dto()))));
const complete = (s, subprocessId) => completeSubprocessOperation(s.repo, {
  orderId: 47, detailId: 470, subprocessId, userId: 7, hydrate: false,
});

test('backend DTO→JSON→frontend preserves Yoyo identity, quantity and ordered processes', () => {
  const s = yoyoRepository();
  // A raw relation may arrive unordered; the mapper must use business sequence,
  // not numeric ID (Empaquetado=5 comes after Ensamblado=10).
  s.detail.Tipo_Producto.Producto_Subproceso.reverse();
  const order = uiOrder(s);
  const [item] = getOrderItems(order);
  assert.equal(order.salesNoteNumber, 'QA-47-YOYO');
  assert.equal(order.product, 'Yoyo');
  assert.equal(item.quantity, 12);
  assert.deepEqual(item.subProcesses.map(({ id, name, status }) => ({ id, name, status })), [
    { id: '10', name: 'Ensamblado', status: 'pending' },
    { id: '5', name: 'Empaquetado', status: 'pending' },
  ]);
  assert.equal(orderMatchesFilters(order, { productType: 'yoyo', salesNoteNumber: 'QA-47' }), true);
  assert.equal(orderMatchesFilters(order, { productType: 'lanyard' }), false);
});

test('UI enables delivery only after both Yoyo subprocesses; no artificial 100% Lanyard requirement', async () => {
  const s = yoyoRepository();
  let [item] = getOrderItems(uiOrder(s));
  assert.equal(isLanyardItem(item), false);
  assert.equal(isItemReadyForDelivery(item), false);
  assert.equal(isLanyardPackagingBlocked(item, item.subProcesses[1]), false);
  await complete(s, 10);
  [item] = getOrderItems(uiOrder(s));
  assert.deepEqual(item.subProcesses.map(process => process.status), ['done', 'pending']);
  assert.equal(isItemReadyForDelivery(item), false);
  assert.equal(isLanyardPackagingBlocked(item, item.subProcesses[1]), false);
  await complete(s, 5);
  [item] = getOrderItems(uiOrder(s));
  assert.deepEqual(item.subProcesses.map(process => process.status), ['done', 'done']);
  assert.equal(item.lanyardProgress.percentage, 0);
  assert.equal(isItemReadyForDelivery(item), true);
});

test('incomplete DTO is rejected instead of silently presenting an empty Yoyo process list', () => {
  const dto = yoyoRepository().dto();
  delete dto.items[0].subProcesses;
  assert.throws(() => parseKanbanOrderDetailDTO(dto), /subProcesses/);
});
