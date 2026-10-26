import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pages } from '../capaVista/verify/pageFixtures.js'

const require = createRequire(new URL('../capaVista/package.json', import.meta.url))
const { parse } = require('espree')
const base = process.argv[2] || 'HEAD'
const normalize = node => {
  if (Array.isArray(node)) return node.filter(item => item?.type !== 'ImportDeclaration').map(normalize)
  if (!node || typeof node !== 'object') return node
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return { type: 'PagePresentation' }
  return Object.fromEntries(Object.entries(node).filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key)).map(([key, value]) => [key, normalize(value)]))
}
function operations(ast) {
  const attributes = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXAttribute' && (/^on[A-Z]/.test(node.name.name) || ['disabled', 'inert'].includes(node.name.name))) {
      attributes.push(JSON.stringify(normalize(node)))
    }
    if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && /^[A-Z]/.test(node.name.name)
      && !['PageShell', 'PageSurface', 'PageHeader', 'OrderCreateHeader', 'CalendarHeader', 'PrivacyPageHeader'].includes(node.name.name)) {
      attributes.push(JSON.stringify({ component: node.name.name, props: node.attributes.filter(attribute => attribute.name?.name !== 'className').map(normalize) }))
    }
    Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value))
  }
  visit(ast)
  return attributes.sort()
}
for (const [id, , source] of pages) {
  const filename = `capaVista/src/modules/${source}.jsx`
  const original = execFileSync('git', ['show', `${base}:${filename}`], { encoding: 'utf8' })
  const current = await readFile(filename, 'utf8')
  const options = { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }
  const before = parse(original, options), after = parse(current, options)
  assert.deepEqual(normalize(after), normalize(before), `${id}: cambió código fuera de la presentación JSX`)
  assert.deepEqual(operations(after), operations(before), `${id}: cambió un evento, disabled, inert o props de componentes internos`)
  console.log(`${id}: lógica, eventos, props internos y condiciones disabled/inert intactos`)
}
console.log('14 páginas verificadas frente a ' + base)
