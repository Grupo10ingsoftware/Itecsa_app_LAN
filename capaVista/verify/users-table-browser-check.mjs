import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// Standalone verification against the real page/router using synthetic GETs only.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const origin = 'http://127.0.0.1:5173', output = join(tmpdir(), 'itecsa-users-table-visual')
await mkdir(output, { recursive: true })
const users = Array.from({ length: 50 }, (_, index) => ({
  idUsuario: index + 1, idUsuarioAutenticacionExterna: `synthetic-${index + 1}`, username: index === 0 ? 'usuario.extenso' : index === 2 ? 'usuario.sintetico.con.identificador.extremadamente.largo.sin.espacios' : `synthetic.${index + 1}`,
  nombreUsuario: index === 0 ? 'Alejandra María' : index === 3 ? 'María Alejandra Fernanda del Carmen' : `Nombre sintético ${index + 1}`,
  apellidoUsuario: index === 0 ? 'Fernández Soto' : `Apellido ${index + 1}`,
  rutUsuario: index === 0 ? '12.345.678-5' : ['1.234.567-4', '9.876.543-3', '20.000.000-5'][index % 3],
  correoUsuario: index === 0 ? 'nombre.apellido@miempresa.test' : index === 1 ? 'direccion.sintetica.especialmente.larga.para.comprobar.el.ajuste@example.test' : `synthetic${index + 1}@example.test`,
  rolUsuario: index === 4 ? 'Rol sintético extraordinariamente extenso para comprobar el ajuste futuro' : ['Administrador Ventas', 'Administrador Producción', 'Operario Cobranzas'][index % 3],
  estadoUsuario: ['Activo', 'Pendiente', 'Desvinculado'][index % 3],
}))

function syntheticRead(url, records) {
  const [path, query] = url.split('?'), params = new URLSearchParams(query)
  if (path === '/admin/identity/users') {
    const filtered = records.filter(user => (!params.get('search') || `${user.username} ${user.nombreUsuario} ${user.apellidoUsuario}`.includes(params.get('search'))) &&
      (!params.get('estadoUsuario') || user.estadoUsuario === params.get('estadoUsuario') || params.get('estadoUsuario') === 'Vinculado' && user.estadoUsuario === 'Activo') &&
      (!params.get('department') || user.rolUsuario.includes({ production: 'Producción', collections: 'Cobranzas', sales: 'Ventas' }[params.get('department')])))
    const page = Number(params.get('page') || 1), perPage = Number(params.get('perPage') || 10)
    return { usuarios: filtered.slice((page - 1) * perPage, page * perPage), total: filtered.length, page, perPage }
  }
  if (path.startsWith('/admin/identity/identities/')) {
    const user = records.find(user => user.idUsuarioAutenticacionExterna === path.split('/').at(-1))
    return { subject: user.idUsuarioAutenticacionExterna, username: user.username, enabled: true,
      firstName: user.nombreUsuario, lastName: user.apellidoUsuario, email: user.correoUsuario, role: user.rolUsuario, localState: user.estadoUsuario }
  }
  if (/^\/admin\/identity\/users\/[^/]+\/movements$/.test(path)) return { records: [], total: 0 }
}

const browser = await chromium.launch({ headless: true }), results = []
try {
  for (const width of [1774, 1440, 1280, 1024, 768, 390, 360, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (/\/verify\/pageFixtures(?:\.js)?$/.test(url.pathname)) {
        const response = await route.fetch(), source = await response.text()
        assert.ok(/async get\(url\) \{/.test(source))
        const replacement = `async get(url) { const synthetic = (${syntheticRead.toString()})(url, ${JSON.stringify(users)}); if (synthetic) return synthetic;`
        return route.fulfill({ response, body: source.replace(/async get\(url\) \{/, () => replacement) })
      }
      return route.continue()
    })
    await page.goto(origin + '/verify/filters.html?module=users&navigation=1', { waitUntil: 'networkidle' })
    await page.getByText('Mostrando 1 a 10 de 50 resultados', { exact: true }).waitFor()
    const table = page.locator('table'), pagination = page.getByRole('navigation', { name: 'Paginación de usuarios' })
    const filter = page.getByRole('region', { name: 'Filtros de usuarios' })
    const create = page.getByRole('button', { name: 'Crear usuario', exact: true })
    const toggle = filter.locator(':scope > button')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.equal((await create.boundingBox()).height, (await filter.boundingBox()).height)
    assert.equal(await page.getByRole('combobox', { name: 'Filas por página' }).inputValue(), '10')
    assert.equal(await table.locator('tbody tr').count(), 10)
    assert.equal(await pagination.locator('[aria-current="page"]').textContent(), '1')
    assert.equal(await pagination.getByRole('button', { name: /^Página \d$/ }).count(), 5)
    const metrics = await table.evaluate(element => {
      const card = element.closest('[role="region"]').parentElement, rect = card.getBoundingClientRect()
      const content = card.parentElement, surface = content.parentElement, surfaceRect = surface.getBoundingClientRect()
      const toolbarRect = content.querySelector('[aria-label="Filtros de usuarios"]').parentElement.getBoundingClientRect()
      const surfaceStyle = getComputedStyle(surface), contentStyle = getComputedStyle(content)
      const cells = [...element.tBodies[0].rows[0].cells]
      return {
        x: rect.x, width: rect.width, radius: getComputedStyle(card).borderRadius,
        surface: { borders: [surfaceStyle.borderLeftWidth, surfaceStyle.borderRightWidth],
          leftInset: rect.left - surfaceRect.left, rightInset: surfaceRect.right - rect.right,
          padding: parseFloat(contentStyle.paddingLeft),
          toolbarX: toolbarRect.x, toolbarWidth: toolbarRect.width },
        borders: [getComputedStyle(card).borderLeftColor, getComputedStyle(card).borderRightColor],
        headings: [...element.querySelectorAll('th')].map(th => ({ text: th.textContent, align: getComputedStyle(th).textAlign,
          background: getComputedStyle(th).backgroundColor, color: getComputedStyle(th).color })),
        values: cells.slice(0, 6).map(td => td.textContent),
        columnWidths: cells.map(td => td.getBoundingClientRect().width),
        referenceWidths: ['usuario.extenso', 'Marcos Vega', '12.345.678-5', 'mvega@mail.test', 'Administrador Producción'].map((text, index) => {
          const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
          context.font = getComputedStyle(cells[index]).font
          return context.measureText(text).width
        }),
        alignments: cells.map(td => getComputedStyle(td).textAlign),
        vertical: cells.map(td => getComputedStyle(td).verticalAlign),
        internalBorders: [...element.querySelectorAll('tr,th,td')].map(el => [getComputedStyle(el).borderLeftWidth, getComputedStyle(el).borderRightWidth]),
        horizontalBorders: [...element.tBodies[0].rows].map(row => getComputedStyle(row.cells[0]).borderBottomWidth),
        overflowingCells: [...element.querySelectorAll('td')].filter(td => td.scrollWidth > td.clientWidth + 1).map(td => td.textContent),
        rowWidths: [...element.tBodies[0].rows].map(row => [...row.cells].map(td => td.getBoundingClientRect().width)),
        rutWrap: getComputedStyle(cells[2]).whiteSpace,
        localScroll: element.parentElement.scrollWidth > element.parentElement.clientWidth,
        actions: [...cells[6].querySelectorAll('button')].map(button => ({
          text: button.textContent, background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color,
          icons: button.querySelectorAll('i, svg').length, bounds: button.getBoundingClientRect().toJSON(),
        })),
      }
    })
    assert.deepEqual(metrics.headings.map(th => th.text), ['Usuario', 'Nombre', 'RUT', 'Correo', 'Rol', 'Estado', 'Acciones'])
    assert.deepEqual(metrics.borders, ['rgb(0, 0, 0)', 'rgb(0, 0, 0)'])
    assert.deepEqual(metrics.surface.borders, ['1px', '1px'], 'The shared page surface continues below the banner')
    assert.ok(Math.abs(metrics.surface.leftInset - metrics.surface.padding - 1) < .1)
    assert.ok(Math.abs(metrics.surface.rightInset - metrics.surface.leftInset) < .1, 'Equal margins inside both sides of the surface')
    assert.ok(Math.abs(metrics.surface.toolbarX - metrics.x) < .1 && Math.abs(metrics.surface.toolbarWidth - metrics.width) < .1,
      'Filters, create user and table share the same inner width')
    assert.equal(await table.isVisible(), true, 'All seven columns stay available through the same table on every screen')
    {
      assert.ok(metrics.headings.every(th => th.align === 'center' && th.background === 'rgb(0, 0, 0)' && th.color === 'rgb(255, 255, 255)'))
      assert.deepEqual(metrics.alignments, ['left', 'left', 'center', 'left', 'left', 'center', 'center'])
      assert.ok(metrics.vertical.every(value => value === 'middle'))
      assert.deepEqual(metrics.values, ['usuario.extenso', 'Alejandra María Fernández Soto', '12.345.678-5', 'nombre.apellido@miempresa.test', 'Administrador Ventas', 'Vinculado'])
      const indices = [0, 1, 3, 4], weights = [11, 16, 20, 17]
      const unit = indices.reduce((sum, index) => sum + metrics.columnWidths[index], 0) / 64
      indices.forEach((index, weight) => assert.ok(Math.abs(metrics.columnWidths[index] - unit * weights[weight]) < .1,
        'Variable columns share a single proportional distribution'))
      metrics.referenceWidths.forEach((textWidth, index) => {
        const spare = metrics.columnWidths[index] - textWidth
        assert.ok(spare >= 16, `Column ${index + 1} fits common values without unnecessary wrapping: ${spare}px`)
      })
      assert.ok(Math.abs(metrics.columnWidths[2] - 104) < .1 && Math.abs(metrics.columnWidths[5] - 136) < .1 && Math.abs(metrics.columnWidths[6] - 264) < .1,
        'RUT stays compact; status and actions retain their controls')
      assert.ok(metrics.internalBorders.every(([left, right]) => left === '0px' && right === '0px'), 'No internal vertical borders')
      assert.ok(metrics.horizontalBorders.every(width => width === '1px'), 'Horizontal row separators remain')
      assert.deepEqual(metrics.overflowingCells, [], 'Long identifiers, names, emails and future roles stay inside their own cells')
      assert.ok(metrics.rowWidths.every(widths => widths.every((value, index) => Math.abs(value - metrics.columnWidths[index]) < .1)), 'Long content cannot change individual row column widths')
      assert.equal(metrics.rutWrap, 'nowrap')
      if (width <= 1440) assert.equal(metrics.localScroll, true, 'Overflow stays inside the table')
      const rows = table.locator('tbody tr')
      for (const [row, column, value] of [[2, 0, users[2].username], [3, 1, `${users[3].nombreUsuario} ${users[3].apellidoUsuario}`], [1, 3, users[1].correoUsuario], [4, 4, users[4].rolUsuario]]) {
        assert.equal(await rows.nth(row).locator('td').nth(column).textContent(), value, 'Full variable text remains accessible')
      }
      assert.ok(metrics.actions.every(button => button.background === 'rgb(0, 0, 0)' && button.color === 'rgb(255, 255, 255)' && !button.icons && button.bounds.height === 40))
      assert.equal(metrics.actions[0].bounds.y, metrics.actions[1].bounds.y)
      assert.ok(metrics.actions[1].bounds.x >= metrics.actions[0].bounds.right + 7.9)
    }
    const area = page.getByRole('region', { name: 'Tabla de usuarios' })
    const badgeSizes = []
    for (const [label, color] of [['Vinculado', 'rgb(36, 143, 85)'], ['Pendiente', 'rgb(254, 90, 0)'], ['Desvinculado', 'rgb(239, 18, 28)']]) {
      const badge = area.getByText(label, { exact: true }).first()
      const appearance = await badge.evaluate(el => ({ color: getComputedStyle(el).color,
        border: getComputedStyle(el).borderTopColor, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
      assert.equal(appearance.color, color); assert.equal(appearance.border, color)
      badgeSizes.push({ width: appearance.width, height: appearance.height })
    }
    assert.ok(badgeSizes.every(size => size.width === 120 && size.height === 40))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await area.evaluate(el => { el.scrollLeft = 0 })
    await page.screenshot({ path: join(output, `users-${width}-initial.png`), fullPage: true, animations: 'disabled' })
    const edit = area.getByRole('button', { name: 'Editar', exact: true }).first()
    await edit.focus(); await edit.press('Enter')
    const editDialog = page.getByRole('dialog', { name: 'Editar usuario' })
    await editDialog.waitFor()
    assert.equal(await editDialog.getByLabel('Nombre', { exact: true }).inputValue(), 'Alejandra María')
    await editDialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await area.getByRole('button', { name: 'Movimientos', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'Movimientos de usuario' }).waitFor()
    await page.getByRole('button', { name: 'Cerrar historial' }).click()
    await create.click(); await page.getByRole('dialog', { name: 'Creacion de usuario' }).waitFor()
    await page.getByRole('button', { name: 'Cerrar modal de creacion' }).click()
    await pagination.getByRole('button', { name: 'Página 5', exact: true }).click()
    await page.getByText('Mostrando 41 a 50 de 50 resultados', { exact: true }).waitFor()
    assert.equal(await table.locator('tbody tr:first-child td:first-child').textContent(), 'synthetic.41')
    assert.equal(await pagination.getByRole('button', { name: 'Página siguiente' }).isDisabled(), true)
    for (const size of [20, 30, 40, 50]) {
      await page.getByRole('combobox', { name: 'Filas por página' }).selectOption(String(size))
      await page.getByText(`Mostrando 1 a ${size} de 50 resultados`, { exact: true }).waitFor()
      assert.equal(await table.locator('tbody tr').count(), size)
    }
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Mostrando 1 a 10 de 50 resultados', { exact: true }).waitFor()
    assert.equal(await page.getByRole('combobox', { name: 'Filas por página' }).inputValue(), '10')
    await toggle.click()
    await filter.getByRole('button', { name: 'Pendientes', exact: true }).click()
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 1 a 10 de 17 resultados', { exact: true }).waitFor()
    await pagination.getByRole('button', { name: 'Página siguiente' }).click()
    await page.getByText('Mostrando 11 a 17 de 17 resultados', { exact: true }).waitFor()
    await filter.getByRole('searchbox').fill('NO-MATCH')
    await filter.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
    await page.getByText('Mostrando 0 a 0 de 0 resultados', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    results.push({ viewport: width, ...metrics, badgeSizes, pagination: 'pass', sizes: [10, 20, 30, 40, 50],
      edit: 'pass', movements: 'pass', create: 'pass', filters: 'pass', reload: 'pass', empty: 'pass', keyboard: 'pass' })
    await page.close(); console.log(`Users table ${width}: pass`)
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log('Screenshots and measurements: ' + output)
} finally { await browser.close() }
