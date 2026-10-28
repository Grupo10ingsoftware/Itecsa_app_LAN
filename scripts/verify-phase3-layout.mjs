// Reuse the existing layout assertions with populated, isolated phase-3 fixtures.
import { readFile, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const selected = 'orders,calendar,kanban,payments,history,history-detail,metrics,users,profile,inbox,message-detail'
let fixtures = await readFile('capaVista/verify/pageFixtures.js', 'utf8')
const item = { id: '1', product: 'Lanyard sintético', quantity: 7, dueDate: '2026-10-29', manufacturingDetails: null, lanyardProgress: null, subProcesses: [] }
const order = { id: 123, salesNoteNumber: 'SYN-FASE3-123', clientName: 'Cliente sintético', dueDate: '2026-10-29', generalStepId: 1,
    orderStatus: 'Listo para producción', labels: [], items: [item], createdAt: '2026-10-01', paymentStatusId: 1, paymentStatus: 'Pendiente' }
fixtures = fixtures.replace("const pageInfo =", `const phase3Order=${JSON.stringify(order)};\nconst pageInfo =`)
fixtures = fixtures.replace("return { ...auth.user, records: [] }", "return { ...auth.user, records: Array.from({length:10},(_,i)=>({id:i+1,detail:'Actividad sintética '+('Referencia'.repeat(16)),dateTime:'2026-10-28T12:00:00Z'})) }")
fixtures = fixtures.replace("if (pathname === '/orders/payments') return { items: [], pageInfo, counts: {}, paymentStatuses: [] }", "if (pathname === '/orders/payments') return { items:[phase3Order],pageInfo,counts:{pending:1,confirmed:0,rejected:0},paymentStatuses:[{id:1,name:'Pendiente'},{id:2,name:'Confirmado'},{id:3,name:'Rechazado'}] }")
fixtures = fixtures.replace("if (pathname === '/orders/calendar-summary' || pathname === '/orders/kanban-summary') return { items: [], pageInfo }", "if (pathname === '/orders/calendar-summary' || pathname === '/orders/kanban-summary') return { items:url.includes('unscheduled=true')?[]:[phase3Order],pageInfo }")
fixtures = fixtures.replace("return { users: [], total: 0, totalPages: 1 }", "return { users:[{idUsuario:1,idUsuarioAutenticacionExterna:'synthetic',nombreUsuario:'Ana',apellidoUsuario:'Sintética',nombreCompleto:'Ana Sintética',rolUsuario:'Soporte',estadoUsuario:'Activo',correoUsuario:'synthetic@example.invalid',rutUsuario:'11111111-1'}],total:1,totalPages:1 }")
fixtures = fixtures.replace("production: { total: 0, products: [] }", "production: { total: 7, products: [{productType:'Lanyard',quantity:7}] }")
fixtures = fixtures.replace("if (pathname === '/history/orders/123') return", "if (pathname === '/history/orders/123') return")
let script = await readFile('scripts/verify-page-layout.mjs', 'utf8')
script = script.replaceAll("'/verify/pageFixtures.js'", "'/phase3-fixtures.js'")
script = script.replace("  resolveId(source) {", "  resolveId(source) {\n    if(source==='/phase3-fixtures.js')return path.join(root,'verify/phase3Fixtures.js');\n    if (/(?:^|\\/)useAuthApi(?:\\.js)?$/.test(source)) return '\\0review-authapi';")
script = script.replace("  load(id) {", `  load(id) {\n    if(id.replaceAll('\\\\','/').endsWith('/verify/phase3Fixtures.js'))return ${JSON.stringify(fixtures)};\n    if(id==='\\0review-authapi')return "import {createAuthApi} from '/src/modules/auth/api/authApi.js';import {client} from '/phase3-fixtures.js';const api=createAuthApi(client);export const useAuthApi=()=>api;";`)
script = script.replace("font:ts.fontSize", "font:ts.fontSize,tableRows:main.querySelectorAll('tbody tr').length")
script = script.replace("'results.json'", "'phase3-results.json'")
const generated = path.resolve('scripts/.phase3-layout-runtime.mjs')
await writeFile(generated, script)
try {
    const child = spawn(process.execPath, [generated, selected], { stdio: 'inherit', windowsHide: true })
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
    if (code !== 0) throw Error('Phase3 browser validation failed')
    const results = JSON.parse(await readFile('capaVista/dist/page-layout-review/phase3-results.json', 'utf8'))
    await writeFile('docs/FASE3_RESPONSIVE.json', JSON.stringify({ reference: '1e7bddd + Fase3 corrections',
        methodology: 'Actual AppLayout/pages, populated synthetic API double; 11 screens covering nine modules, 17 viewport/sidebar combinations each, extra title/zoom/keyboard assertions; no enterprise login or real API E2E.', results }, null, 2) + '\n')
} finally { await rm(generated, { force: true }) }
