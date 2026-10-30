import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// Uses an externally available Playwright installation; no project dependency.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const output = process.env.FILTER_SCREENSHOT_DIR || join(tmpdir(), 'itecsa-filter-layout-visual')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 1280, 1024, 768, 390, 360, 320]) {
    let calendarLayout
    for (const module of ['calendar', 'kanban', 'payments', 'history', 'inbox', 'users']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5173'
        ? route.continue() : route.abort())
      await page.goto('http://127.0.0.1:5173/verify/filters.html?module=' + module, { waitUntil: 'networkidle' })
      const apply = page.getByRole('button', { name: 'Aplicar filtros', exact: true, includeHidden: true })
      const panel = apply.locator('xpath=ancestor::section[1]')
      const toggle = panel.locator(':scope > button')
      await panel.waitFor()
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', module + ' must start closed')
      assert.equal(await apply.isVisible(), false)
      const exterior = await panel.evaluate(element => {
        const bounds = element.getBoundingClientRect(), parent = element.parentElement
        const parentBounds = parent.getBoundingClientRect(), css = getComputedStyle(parent)
        const before = element.previousElementSibling, after = element.nextElementSibling
        return {
          x: bounds.x, width: bounds.width, height: bounds.height,
          headerHeight: element.querySelector('button').getBoundingClientRect().height,
          parentWidth: parentBounds.width, paddingLeft: parseFloat(css.paddingLeft), paddingRight: parseFloat(css.paddingRight),
          hasPrevious: Boolean(before), layoutGap: parseFloat(css.rowGap),
          leftInset: bounds.left - parentBounds.left, rightInset: parentBounds.right - bounds.right,
          topGap: bounds.top - (before ? before.getBoundingClientRect().bottom : parentBounds.top),
          bottomGap: (after ? after.getBoundingClientRect().top : parentBounds.bottom) - bounds.bottom,
          radius: getComputedStyle(element).borderRadius,
        }
      })
      if (module === 'calendar') calendarLayout = exterior
      for (const property of ['height', 'headerHeight', 'radius']) assert.equal(exterior[property], calendarLayout[property], module + ' ' + property)
      if (module === 'kanban') {
        const meter = page.getByRole('complementary', { name: 'Carga Operativa' })
        const bounds = await meter.boundingBox(), filter = await panel.boundingBox()
        assert.equal(bounds.height, exterior.height, 'Load and collapsed filter have identical heights')
        assert.equal(await meter.locator('xpath=ancestor::*[@data-page-header]').count(), 0)
        if (width >= 992) {
          assert.equal(bounds.y, filter.y)
          assert.ok(bounds.x >= filter.x + filter.width + 15.9)
        } else assert.ok(bounds.y >= filter.y + filter.height + 15.9)
        assert.equal(await meter.getByRole('progressbar').getAttribute('aria-valuenow'), '75')
        await meter.getByRole('button', { name: 'Configurar carga operativa' }).click()
        await page.getByRole('dialog', { name: 'Carga diaria de Lanyard' }).waitFor()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      } else if (module !== 'users') {
        for (const property of ['width', 'leftInset', 'rightInset', 'bottomGap']) {
          assert.ok(Math.abs(exterior[property] - calendarLayout[property]) < .05, module + ' differs from Calendar: ' + property)
        }
        const expectedTopGap = exterior.hasPrevious ? exterior.layoutGap : calendarLayout.topGap
        assert.ok(Math.abs(exterior.topGap - expectedTopGap) < .05, module + ' top gap follows the shared padding or sibling gap')
        assert.ok(Math.abs(exterior.width - (exterior.parentWidth - exterior.paddingLeft - exterior.paddingRight)) < .05)
      } else {
        const create = page.getByRole('button', { name: 'Crear usuario', exact: true })
        const button = await create.boundingBox(), header = await toggle.boundingBox()
        assert.ok(Math.abs(button.height - exterior.height) < .1, 'Create user matches the collapsed filter height')
        if (width >= 768) {
          assert.ok(Math.abs(button.y + button.height / 2 - (header.y + header.height / 2)) < .1)
          assert.ok(button.x >= exterior.x + exterior.width + 15.9)
        } else assert.ok(button.y >= header.y + header.height + 15.9)
        await create.click()
        await page.getByRole('dialog', { name: 'Creacion de usuario' }).waitFor()
        await page.getByRole('button', { name: 'Cerrar modal de creacion' }).click()
      }
      await panel.screenshot({ path: join(output, module + '-' + width + '-initial.png') })
      if (width === 1440 || width === 390) await page.screenshot({ path: join(output, module + '-' + width + '-initial-page.png'), fullPage: true })
      const initialReads = await page.evaluate(() => window.__filterReads.length)
      await toggle.press('Enter')
      await apply.waitFor({ state: 'visible' })
      assert.equal(await page.evaluate(() => window.__filterReads.length), initialReads)
      assert.equal(errors.length, 0, errors.join('; '))
      const measurements = await panel.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const header = element.querySelector('button')
        const controls = [...element.querySelectorAll('input, select')].map(input => {
          const control = input.tagName === 'SELECT' ? input : input.parentElement
          return control.getBoundingClientRect().height
        })
        const overflow = [...element.querySelectorAll('button, input, select, fieldset, label')].filter(child => {
          const rect = child.getBoundingClientRect()
          return rect.width && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)
        }).map(child => child.tagName)
        const footer = element.querySelector('footer')
        return {
          controls, overflow,
          stripe: getComputedStyle(header).borderBottomColor,
          header: getComputedStyle(header).backgroundColor,
          actions: [...footer.querySelectorAll('button')].map(button => ({
            text: button.textContent, height: button.getBoundingClientRect().height, icons: button.querySelectorAll('svg,i').length,
          })),
          columns: getComputedStyle(element.querySelector('[data-columns]')).gridTemplateColumns.split(' ').length,
        }
      })
      assert.deepEqual(measurements.overflow, [], module + ' overflow at ' + width)
      assert.ok(measurements.controls.every(height => height >= 44), module + ' control height')
      assert.equal(measurements.stripe, 'rgb(254, 90, 0)')
      assert.equal(measurements.header, 'rgb(0, 0, 0)')
      assert.deepEqual(measurements.actions.map(action => action.text), ['Limpiar filtros', 'Aplicar filtros'])
      assert.ok(measurements.actions.every(action => action.height >= 44 && !action.icons))
      if (width >= 1280 && !['users', 'kanban'].includes(module)) assert.equal(measurements.columns, module === 'history' ? 2 : 3)
      if (width <= 767) assert.equal(measurements.columns, 1)
      await panel.screenshot({ path: join(output, module + '-' + width + '-open.png') })
      if (width === 1440 || width === 390) await page.screenshot({ path: join(output, module + '-' + width + '-page.png'), fullPage: true })

      if (module === 'kanban') {
        const meter = page.getByRole('complementary', { name: 'Carga Operativa' })
        assert.equal((await meter.boundingBox()).height, exterior.height, 'Expanded filters do not stretch load')
        const colors = await meter.evaluate(element => ({
          background: getComputedStyle(element).backgroundColor,
          stripe: getComputedStyle(element, '::after').backgroundColor,
          gear: getComputedStyle(element.querySelector('button')).color,
        }))
        assert.deepEqual(colors, { background: 'rgb(0, 0, 0)', stripe: 'rgb(254, 90, 0)', gear: 'rgb(254, 90, 0)' })
        await meter.getByRole('button', { name: 'Configurar carga operativa' }).click()
        await page.getByRole('dialog', { name: 'Carga diaria de Lanyard' }).waitFor()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      }

      if (module === 'users') {
        const create = page.getByRole('button', { name: 'Crear usuario', exact: true })
        const bounds = await panel.boundingBox(), button = await create.boundingBox()
        assert.ok(Math.abs(button.height - exterior.height) < .1, 'Create user retains the filter header height when expanded')
        if (width >= 768) assert.ok(button.x >= bounds.x + bounds.width + 15.9)
        else assert.ok(button.y >= bounds.y + bounds.height + 15.9)
        await create.click()
        await page.getByRole('dialog', { name: 'Creacion de usuario' }).waitFor()
        await page.getByRole('button', { name: 'Cerrar modal de creacion' }).click()
      }
      const search = panel.getByRole('searchbox').first()
      if (module === 'inbox') {
        assert.equal(await panel.getByRole('searchbox').count(), 0)
        await panel.getByRole('button', { name: 'No leídos', exact: true }).click()
        await panel.getByRole('button', { name: 'Más antiguos', exact: true }).click()
        await panel.getByLabel('Desde', { exact: true }).fill('2026-01-01')
      } else await search.fill('001')
      await page.waitForTimeout(400)
      assert.equal(await page.evaluate(() => window.__filterReads.length), initialReads, 'draft must not read: ' + module)
      await toggle.focus()
      await page.keyboard.press('Space')
      assert.equal(await apply.isVisible(), false)
      await toggle.blur()
      await panel.screenshot({ path: join(output, module + '-' + width + '-closed.png') })
      await toggle.focus()
      await page.keyboard.press('Enter')
      await apply.waitFor({ state: 'visible' })
      assert.equal(await apply.isVisible(), true)
      if (module !== 'inbox') {
        assert.equal(await search.inputValue(), '001')
        const rightButton = search.locator('xpath=following-sibling::button')
        assert.equal(await rightButton.count(), 1)
        // Native Enter and the integrated search share the panel's submit.
        await search.press('Enter')
      } else await apply.click()
      const expectedReads = initialReads + (module === 'calendar' ? 0 : 1)
      await page.waitForFunction(count => window.__filterReads.length === count, expectedReads)
      await apply.click()
      await page.waitForTimeout(80)
      assert.equal(await page.evaluate(() => window.__filterReads.length), expectedReads, 'duplicate Apply: ' + module)
      await panel.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
      await page.waitForFunction(count => window.__filterReads.length === count, expectedReads + (module === 'calendar' ? 0 : 1))
      if (module !== 'inbox') assert.equal(await search.inputValue(), '')
      assert.equal(errors.length, 0, errors.join('; '))
      results.push({ module, width, exterior, initiallyCollapsed: true, ...measurements, keyboard: 'pass', drafts: 'pass', collapse: 'pass', apply: 'pass', clear: 'pass' })
      await page.close()
      console.log(module + ' ' + width + ': pass')
    }
  }
  const states = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await states.goto('http://127.0.0.1:5173/verify/filters.html?module=history', { waitUntil: 'networkidle' })
  await states.getByRole('button', { name: 'Expandir filtros del historial' }).click()
  const search = states.getByRole('searchbox')
  await search.hover()
  await states.waitForFunction(() => getComputedStyle(document.querySelector('input[type="search"]').parentElement).borderTopColor === 'rgb(100, 116, 139)')
  await search.focus()
  await states.waitForFunction(() => getComputedStyle(document.querySelector('input[type="search"]').parentElement).borderTopColor === 'rgb(254, 90, 0)')
  await states.screenshot({ path: join(output, 'history-focus.png'), fullPage: true })
  await states.getByLabel('Desde', { exact: true }).fill('2026-10-28')
  await states.getByLabel('Hasta', { exact: true }).fill('2026-01-01')
  await states.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await states.waitForFunction(() => getComputedStyle(document.querySelector('input[type="date"]:invalid').parentElement).borderTopColor === 'rgb(239, 18, 28)')
  assert.equal(await states.evaluate(() => window.__filterReads.length), 1)
  assert.equal(await states.getByRole('alert').count(), 1)
  await states.screenshot({ path: join(output, 'history-error.png'), fullPage: true })
  await states.goto('http://127.0.0.1:5173/verify/filters.html?module=payments&disabled=1', { waitUntil: 'networkidle' })
  await states.getByRole('button', { name: 'Expandir filtros de pago' }).click()
  assert.equal(await states.getByRole('button', { name: 'Aplicar filtros', exact: true }).isDisabled(), true)
  assert.equal(await states.getByRole('searchbox').isDisabled(), true)
  assert.equal(await states.evaluate(() => window.__filterReads.length), 0)
  await states.screenshot({ path: join(output, 'payments-disabled.png'), fullPage: true })
  await states.close()
  const navigation = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const navigationErrors = []
  navigation.on('pageerror', error => navigationErrors.push(error.message))
  for (const [module, link] of [
    ['calendar', 'Calendario'], ['kanban', 'Producción'], ['payments', 'Confirmar pago'],
    ['history', 'Historial de pedidos'], ['users', 'Gestion de usuarios'], ['inbox', 'Bandeja de mensajes'],
  ]) {
    await navigation.goto('http://127.0.0.1:5173/verify/filters.html?module=' + module + '&navigation=1', { waitUntil: 'networkidle' })
    const main = navigation.getByRole('main')
    const toggle = main.getByRole('button', { name: /^Expandir filtros/ })
    await toggle.waitFor()
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    await toggle.click()
    await main.getByRole('button', { name: 'Aplicar filtros', exact: true }).waitFor()
    const search = main.getByRole('searchbox').first()
    if (module === 'inbox') await main.getByRole('button', { name: 'No leídos', exact: true }).click()
    else await search.fill('001')
    await main.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await navigation.waitForTimeout(100)
    const reads = await navigation.evaluate(() => window.__filterReads.length)
    await main.getByRole('button', { name: /^Contraer filtros/ }).click()
    await main.getByRole('button', { name: /^Expandir filtros/ }).click()
    if (module === 'inbox') assert.equal(await main.getByRole('button', { name: 'No leídos', exact: true }).getAttribute('aria-pressed'), 'true')
    else assert.equal(await search.inputValue(), '001')
    assert.equal(await navigation.evaluate(() => window.__filterReads.length), reads)
    await navigation.getByRole('link', { name: 'Documentos', exact: true }).click()
    await main.getByRole('heading', { name: 'LEGAL Y PRIVACIDAD' }).waitFor()
    await navigation.getByRole('link', { name: link, exact: true }).click()
    await main.getByRole('button', { name: /^Expandir filtros/ }).waitFor()
    assert.equal(await main.getByRole('button', { name: 'Aplicar filtros', exact: true }).isVisible(), false)
    await navigation.screenshot({ path: join(output, module + '-router-reentry.png'), fullPage: true })
    console.log(module + ': real router re-entry pass')
  }
  assert.deepEqual(navigationErrors, [])
  await navigation.close()
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log('Shared hover, focus, native error, blocked invalid Apply and disabled permissions: pass')
  console.log('Screenshots and measurements: ' + output)
} finally {
  await browser.close()
}
