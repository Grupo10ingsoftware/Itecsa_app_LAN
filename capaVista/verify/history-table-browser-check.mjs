import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// Real router/page, synthetic reads only. Never calls a live API or writes data.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const origin = 'http://127.0.0.1:5173', output = join(tmpdir(), 'itecsa-history-table-visual')
await mkdir(output, { recursive: true })
const statuses = ['Listo para Producción', 'Confirmación de Pago', 'En producción', 'En revisión', 'Listo para Entrega', 'Terminado']
const orders = Array.from({ length: 50 }, (_, index) => ({
  id: 50 - index, salesNoteNumber: String(29049 - index), clientName: `Cliente sintético ${index + 1}`,
  status: statuses[index % statuses.length], createdAt: '2026-10-29T12:00:00Z',
}))

function syntheticRead(url, records) {
  const [path, query] = url.split('?'), params = new URLSearchParams(query)
  if (path === '/history/orders') {
    const matching = records.filter(item => (!params.get('status') || item.status === params.get('status')) &&
      (!params.get('search') || `${item.salesNoteNumber} ${item.clientName}`.includes(params.get('search'))) &&
      (!params.get('from') || item.createdAt.slice(0, 10) >= params.get('from')) &&
      (!params.get('to') || item.createdAt.slice(0, 10) <= params.get('to')))
    const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 10)
    return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length, page }
  }
  if (/^\/history\/orders\/\d+$/.test(path)) {
    const order = records.find(item => item.id === Number(path.split('/').at(-1)))
    return { ...order, client: { name: order.clientName }, seller: { name: 'Vendedor sintético' },
      items: [], labels: [], events: [], pageInfo: { hasMore: false, nextCursor: null } }
  }
}

const browser = await chromium.launch({ headless: true }), results = []
try {
  for (const width of [1774, 1440, 1280, 1024, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (/\/verify\/pageFixtures(?:\.js)?$/.test(url.pathname)) {
        const response = await route.fetch(), source = await response.text()
        assert.ok(/async get\(url\) \{/.test(source))
        const replacement = `async get(url) { const synthetic = (${syntheticRead.toString()})(url, ${JSON.stringify(orders)}); if (synthetic) return synthetic;`
        return route.fulfill({ response, body: source.replace(/async get\(url\) \{/, () => replacement) })
      }
      return route.continue()
    })
    await page.goto(origin + '/verify/filters.html?module=history&navigation=1', { waitUntil: 'networkidle' })
    const table = page.locator('table'), region = page.getByRole('region', { name: 'Tabla del historial de pedidos' })
    const pagination = page.getByRole('navigation', { name: 'Paginación del historial' })
    const size = page.getByRole('combobox', { name: 'Filas por página' })
    await page.getByText('Mostrando 1 a 10 de 50 resultados', { exact: true }).waitFor()
    assert.equal(await size.inputValue(), '10')
    assert.equal(await table.locator('tbody tr').count(), 10)
    const metrics = await table.evaluate(element => {
      const card = element.closest('section'), style = getComputedStyle(card), rect = card.getBoundingClientRect()
      return { card: rect.toJSON(), borders: [style.borderLeftColor, style.borderRightColor],
        headings: [...element.querySelectorAll('th')].map(th => ({ text: th.textContent, scope: th.scope,
          background: getComputedStyle(th).backgroundColor, color: getComputedStyle(th).color })),
        cells: [...element.tBodies[0].rows[0].cells].map(td => ({ align: getComputedStyle(td).textAlign,
          vertical: getComputedStyle(td).verticalAlign, padding: parseFloat(getComputedStyle(td).paddingTop) })),
        badges: [...element.querySelectorAll('[data-tone]')].slice(0, 6).map(badge => {
          const style = getComputedStyle(badge), rect = badge.getBoundingClientRect()
          return { tone: badge.dataset.tone, width: rect.width, height: rect.height, background: style.backgroundColor, color: style.color, border: style.borderTopColor }
        }),
        stripes: [...element.tBodies[0].rows].slice(0, 2).map(tr => getComputedStyle(tr.cells[0]).backgroundColor),
        scrollsLocally: element.parentElement.scrollWidth > element.parentElement.clientWidth,
      }
    })
    assert.deepEqual(metrics.borders, ['rgb(0, 0, 0)', 'rgb(0, 0, 0)'])
    assert.deepEqual(metrics.headings.map(th => th.text), ['Nota de venta', 'Cliente', 'Estado actual', 'Fecha creación', 'Acción'])
    assert.ok(metrics.headings.every(th => th.scope === 'col' && th.background === 'rgb(0, 0, 0)' && th.color === 'rgb(255, 255, 255)'))
    assert.ok(metrics.cells.every(cell => cell.align === 'center' && cell.vertical === 'middle' && cell.padding >= 12))
    assert.deepEqual(metrics.badges.map(badge => badge.tone), ['ready', 'payment', 'production', 'review', 'delivery', 'finished'])
    assert.equal(new Set(metrics.badges.map(badge => badge.color)).size, 6)
    assert.ok(metrics.badges.every(badge => badge.width === 200 && badge.height === 40 && badge.border === badge.color && badge.background === 'rgb(255, 255, 255)'))
    assert.notEqual(metrics.stripes[0], metrics.stripes[1])
    const filter = page.getByRole('region', { name: 'Filtros del historial' }), filterBox = await filter.boundingBox()
    assert.ok(Math.abs(filterBox.x - metrics.card.x) < 1 && Math.abs(filterBox.width - metrics.card.width) < 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    if (width <= 1024) assert.ok(metrics.scrollsLocally, 'Small screens scroll inside the table only')
    assert.equal(await pagination.evaluate(nav => getComputedStyle(nav.parentElement).backgroundColor), 'rgb(0, 0, 0)')
    await page.screenshot({ path: join(output, `history-${width}-initial.png`), fullPage: true, animations: 'disabled' })
    // The scrollable region and native links remain usable by keyboard on mobile.
    await region.focus()
    const detail = table.getByRole('link', { name: 'Ver detalle', exact: true }).first()
    await detail.focus()
    assert.deepEqual(await detail.evaluate(link => ({ color: getComputedStyle(link).color, background: getComputedStyle(link).backgroundColor, icons: link.querySelectorAll('i,svg').length })),
      { color: 'rgb(255, 255, 255)', background: 'rgb(0, 0, 0)', icons: 0 })
    await detail.press('Enter')
    await page.getByRole('heading', { name: '29049', exact: true }).waitFor()
    await page.getByRole('link', { name: /Volver/ }).click()
    await page.getByText('Mostrando 1 a 10 de 50 resultados', { exact: true }).waitFor()
    await pagination.getByRole('button', { name: 'Página 5', exact: true }).click()
    await page.getByText('Mostrando 41 a 50 de 50 resultados', { exact: true }).waitFor()
    assert.equal(await table.locator('tbody tr:first-child td:first-child').textContent(), '29009')
    assert.equal(await pagination.getByRole('button', { name: 'Página siguiente' }).isDisabled(), true)
    for (const count of [20, 30, 40, 50]) {
      await size.selectOption(String(count))
      await page.getByText(`Mostrando 1 a ${count} de 50 resultados`, { exact: true }).waitFor()
      assert.equal(await table.locator('tbody tr').count(), count)
    }
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Mostrando 1 a 10 de 50 resultados', { exact: true }).waitFor()
    assert.equal(await size.inputValue(), '10')
    await filter.getByRole('button', { name: 'Expandir filtros del historial' }).click()
    await filter.getByRole('button', { name: 'Finalizado', exact: true }).click()
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 1 a 8 de 8 resultados', { exact: true }).waitFor()
    await filter.getByRole('searchbox').fill('NO-MATCH')
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 0 a 0 de 0 resultados', { exact: true }).waitFor()
    assert.equal(await size.isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    results.push({ viewport: width, ...metrics, detail: 'pass', pagination: 'pass', sizes: [10, 20, 30, 40, 50], reload: 'pass', filters: 'pass', empty: 'pass' })
    await page.close()
    console.log(`History table ${width}: pass`)
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log('Screenshots and measurements: ' + output)
} finally { await browser.close() }
