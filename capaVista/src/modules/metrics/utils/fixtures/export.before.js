// Frozen serializer expressions from 51a4d89; reference only.
import {escapeReportHtml,spreadsheetCell} from '../reportFormatting.js'
export function beforeSellerReport(rows,format,queryFrom,queryTo){
    const headers = ['Vendedor', 'Notas de venta', 'Entregados a tiempo', 'Entregados fuera de plazo', 'Ingresados con carga alta']
    const values = rows.map((row) => [row.seller, row.salesNotes, row.deliveredOnTime, row.deliveredLate, row.enteredDuringHighLoad])

  if(format === 'pdf') return `<html><head><title>Reporte de cumplimiento</title></head><body><h1>Reporte de cumplimiento por vendedor</h1><p>Periodo: ${escapeReportHtml(queryFrom)} a ${escapeReportHtml(queryTo)}</p><table border="1"><thead><tr>${headers.map((header) => `<th>${escapeReportHtml(header)}</th>`).join('')}</tr></thead><tbody>${values.map((row) => `<tr>${row.map((value) => `<td>${escapeReportHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
    const separator = format === 'excel' ? '\t' : ','
    const content = [headers, ...values].map((row) => row.map((value) => format === 'csv' ? `"${spreadsheetCell(value).replaceAll('"', '""')}"` : spreadsheetCell(value)).join(separator)).join('\n')
  return '\ufeff'+content
}
