import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// Real payment page and router, synthetic read-only data; no production API calls.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const origin = 'http://127.0.0.1:5173'
const output = join(tmpdir(), 'itecsa-payment-table-visual')
await mkdir(output, { recursive: true })
const orders = ['Pendiente', 'Confirmado', 'Rechazado'].flatMap((paymentStatus, statusIndex) =>
  Array.from({ length: 67 }, (_, index) => ({
    id: statusIndex * 100 + index + 1, salesNoteNumber: `SYNTH-${statusIndex + 1}-${index + 1}`,
    clientName: index === 1 ? 'Cliente sintético con un nombre comercial especialmente largo para comprobar el ajuste de texto' : `Cliente sintético ${index + 1}`,
    clientBusinessName: null, clientRut: `RUT-SYNTH-${index + 1}`, createdAt: '2026-10-05T12:00:00Z',
    paymentStatusId: statusIndex + 1, paymentStatus,
  })))

function syntheticRead(url, items) {
  const [path, query] = url.split('?')
  if (path === '/orders/payments') {
    const params = new URLSearchParams(query)
    const searched = items.filter(item => !params.get('search') || `${item.salesNoteNumber} ${item.clientName}`.includes(params.get('search')))
    const matching = searched.filter(item => item.paymentStatus === params.get('status'))
    const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 50)
    const offset = (page - 1) * limit
    return {
      items: matching.slice(offset, offset + limit),
      pageInfo: { nextCursor: matching.length > offset + limit ? 'synthetic-next' : null, hasMore: matching.length > offset + limit },
      counts: { pending: searched.filter(item => item.paymentStatus === 'Pendiente').length,
        confirmed: searched.filter(item => item.paymentStatus === 'Confirmado').length,
        rejected: searched.filter(item => item.paymentStatus === 'Rechazado').length },
      paymentStatuses: [{ id: 1, name: 'Pendiente' }, { id: 2, name: 'Confirmado' }, { id: 3, name: 'Rechazado' }],
    }
  }
  if (/^\/orders\/\d+\/payment-records\/preview$/.test(path)) {
    const order = items.find(item => item.id === Number(path.split('/')[2]))
    return { nvNumber: order.salesNoteNumber, companyName: order.clientName, rut: order.clientRut,
      products: [{ id: 1, product: 'Producto sintético', code: 'SYNTHETIC', quantity: 10, productType: 'Lanyard' }] }
  }
}

const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1774, 1440, 1280, 1024, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (url.pathname === '/verify/filterFixtures.jsx') {
        const response = await route.fetch()
        const source = await response.text()
        const countsOverride = /if\s*\(path\.startsWith\(["']\/orders\/payments\?["']\)\)\s*payload\.counts\s*=\s*\{[^}]+\};?/
        assert.ok(countsOverride.test(source), 'Replace the generic counts with this test dataset counts')
        return route.fulfill({ response, body: source.replace(countsOverride, '') })
      }
      if (/\/verify\/pageFixtures(?:\.js)?$/.test(url.pathname)) {
        const response = await route.fetch()
        const source = await response.text()
        const replacement = `async get(url) { const synthetic = (${syntheticRead.toString()})(url, ${JSON.stringify(orders)}); if (synthetic) return synthetic;`
        assert.ok(/async get\(url\) \{/.test(source), 'Fixture module entry found')
        return route.fulfill({ response, body: source.replace(/async get\(url\) \{/, () => replacement) })
      }
      return route.continue()
    })
    await page.goto(origin + '/verify/filters.html?module=payments&navigation=1', { waitUntil: 'networkidle' })
    const table = page.locator('table')
    await page.waitForFunction(() => document.querySelector('table tbody')?.rows.length === 10)
    await page.getByText('Mostrando 1 a 10 de 67 resultados', { exact: true }).waitFor()
    const sizeSelect = page.getByRole('combobox', { name: 'Filas por página' })
    assert.equal(await sizeSelect.inputValue(), '10')
    const filter = page.getByRole('region', { name: 'Filtros de pago' })
    assert.equal(await filter.getByRole('button', { name: 'Expandir filtros de pago' }).getAttribute('aria-expanded'), 'false')
    const region = page.getByRole('region', { name: width >= 992 ? 'Tabla de pagos' : 'Pedidos de pago' })
    const measurements = await table.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const frame = element.closest('section').parentElement, frameStyle = getComputedStyle(frame)
      return {
        x: rect.x, width: rect.width,
        frame: { x: frame.getBoundingClientRect().x, width: frame.getBoundingClientRect().width,
          borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ color: frameStyle[`border${side}Color`], width: frameStyle[`border${side}Width`] })) },
        headings: [...element.querySelectorAll('th')].map(th => ({ text: th.textContent,
          align: getComputedStyle(th).textAlign, background: getComputedStyle(th).backgroundColor, color: getComputedStyle(th).color })),
        cells: [...element.tBodies[0].rows[0].cells].map(td => ({ width: td.getBoundingClientRect().width,
          align: getComputedStyle(td).textAlign, vertical: getComputedStyle(td).verticalAlign, padding: parseFloat(getComputedStyle(td).paddingTop) })),
      }
    })
    if (width >= 992) {
      const filterRect = await filter.boundingBox()
      assert.ok(Math.abs(filterRect.x - measurements.frame.x) < 1)
      assert.ok(Math.abs(filterRect.width - measurements.frame.width) < 1)
      assert.ok(measurements.frame.borders.every(border => border.color === 'rgb(0, 0, 0)' && border.width === '1px'), 'The table and footer have a complete black frame')
      assert.deepEqual(measurements.headings.map(item => item.text), ['Pedido', 'Cliente', 'RUT', 'Fecha', 'Estado', 'Acciones'])
      assert.ok(measurements.headings.every(item => item.align === 'center' && item.background === 'rgb(0, 0, 0)' && item.color === 'rgb(255, 255, 255)'))
      assert.ok(measurements.cells.every(item => item.align === 'center' && item.vertical === 'middle' && item.padding >= 19))
      assert.ok(measurements.cells[1].width > measurements.cells[0].width)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const manage = region.getByRole('button', { name: 'Gestionar', exact: true }).first()
    const manageStyle = await manage.evaluate(button => ({ background: getComputedStyle(button).backgroundColor,
      color: getComputedStyle(button).color, icons: button.querySelectorAll('i, svg').length }))
    assert.deepEqual(manageStyle, { background: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)', icons: 0 })
    await page.screenshot({ path: join(output, `payments-${width}-pending.png`), fullPage: true, animations: 'disabled' })
    await manage.focus()
    await manage.press('Enter')
    const menu = region.getByRole('menu', { name: 'Acciones de pago' })
    await menu.waitFor()
    await page.keyboard.press('Tab')
    assert.equal(await region.getByRole('menuitem', { name: /Confirmar/ }).evaluate(el => el === document.activeElement), true)
    await region.getByRole('menuitem', { name: /Confirmar/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await dialog.getByText('Producto sintético', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    const badgeSizes = []
    for (const [label, status, color] of [
      ['Pendientes', 'Pendiente', 'rgb(254, 90, 0)'],
      ['Confirmados', 'Confirmado', 'rgb(36, 143, 85)'],
      ['Rechazados', 'Rechazado', 'rgb(239, 18, 28)'],
    ]) {
      const toggle = filter.locator(':scope > button')
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
      await filter.getByRole('button', { name: new RegExp('^' + label) }).click()
      await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
      const statusBadge = region.getByText(status, { exact: true }).first()
      await statusBadge.waitFor()
      const badge = await statusBadge.evaluate(element => ({ width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height, color: getComputedStyle(element).color,
        border: getComputedStyle(element).borderTopColor, background: getComputedStyle(element).backgroundColor }))
      assert.equal(badge.color, color)
      assert.equal(badge.border, color)
      assert.equal(badge.background, 'rgb(255, 255, 255)')
      badgeSizes.push({ width: badge.width, height: badge.height })
      if (status !== 'Pendiente') {
        await region.getByRole('button', { name: 'Ver detalle', exact: true }).first().click()
        await page.getByRole('dialog', { name: 'Detalle de pago' }).waitFor()
        await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
      }
    }
    assert.ok(badgeSizes.every(size => size.width === badgeSizes[0].width && size.height === badgeSizes[0].height))
    await filter.locator(':scope > button').click()
    const pagination = page.getByRole('navigation', { name: 'Paginación de pagos' })
    assert.equal(await pagination.evaluate(nav => getComputedStyle(nav.parentElement).backgroundColor), 'rgb(0, 0, 0)')
    await pagination.getByRole('button', { name: 'Página 2', exact: true }).click()
    await page.getByText('Mostrando 11 a 20 de 67 resultados', { exact: true }).waitFor()
    assert.equal(await table.locator('tbody tr').count(), 10)
    assert.equal(await table.locator('tbody tr:first-child td:first-child').textContent(), 'SYNTH-3-11')
    await pagination.getByRole('button', { name: 'Página 5', exact: true }).click()
    await page.getByText('Mostrando 41 a 50 de 67 resultados', { exact: true }).waitFor()
    for (const size of [20, 30, 40, 50]) {
      await sizeSelect.selectOption(String(size))
      await page.getByText(`Mostrando 1 a ${size} de 67 resultados`, { exact: true }).waitFor()
      assert.equal(await table.locator('tbody tr').count(), size)
      assert.equal(await pagination.getByRole('button', { name: 'Página 1', exact: true }).getAttribute('aria-current'), 'page')
    }
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Mostrando 1 a 10 de 67 resultados', { exact: true }).waitFor()
    assert.equal(await sizeSelect.inputValue(), '10')
    await filter.locator(':scope > button').click()
    await filter.getByRole('searchbox').fill('SYNTH-1-67')
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 1 a 1 de 1 resultados', { exact: true }).waitFor()
    assert.equal(await pagination.getByRole('button', { name: 'Página siguiente' }).isDisabled(), true)
    await filter.getByRole('searchbox').fill('NO-MATCH')
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 0 a 0 de 0 resultados', { exact: true }).waitFor()
    assert.equal(await sizeSelect.isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    results.push({ width, ...measurements, badgeSizes, keyboard: 'pass', modal: 'pass', detail: 'pass',
      filters: 'pass', numberedPages: 'pass', pageSizes: [10, 20, 30, 40, 50], refreshReset: 'pass', emptyFooter: 'pass' })
    await page.close()
    console.log(`Payment table ${width}: pass`)
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log('Screenshots and measurements: ' + output)
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true })
    console.error(await page.evaluate(() => ({ reads: window.__filterReads,
      expanded: [...document.querySelectorAll('[aria-haspopup="menu"]')].map(el => el.getAttribute('aria-expanded')),
      menus: [...document.querySelectorAll('[role="menu"]')].map(el => el.textContent), focus: document.activeElement?.textContent })))
  }
  throw error
} finally { await browser.close() }
