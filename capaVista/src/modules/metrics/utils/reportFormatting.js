export function escapeReportHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function spreadsheetCell(value) {
  if (typeof value !== 'string') return String(value ?? '')
  const text = value.replace(/[\t\r\n]/g, ' ')
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text
}

export function buildSellerReport(rows, format, from, to) {
  const headers = ['Vendedor', 'Notas de venta', 'Entregados a tiempo', 'Entregados fuera de plazo', 'Ingresados con carga alta']
  const values = rows.map(row => [row.seller, row.salesNotes, row.deliveredOnTime, row.deliveredLate, row.enteredDuringHighLoad])
  if (format === 'pdf') {
    return `<html><head><title>Reporte de cumplimiento</title></head><body><h1>Reporte de cumplimiento por vendedor</h1><p>Periodo: ${escapeReportHtml(from)} a ${escapeReportHtml(to)}</p><table border="1"><thead><tr>${headers.map(header => `<th>${escapeReportHtml(header)}</th>`).join('')}</tr></thead><tbody>${values.map(row => `<tr>${row.map(value => `<td>${escapeReportHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
  }
  const separator = format === 'excel' ? '\t' : ','
  return '\ufeff' + [headers, ...values].map(row => row.map(value => format === 'csv' ? `"${spreadsheetCell(value).replaceAll('"', '""')}"` : spreadsheetCell(value)).join(separator)).join('\n')
}
