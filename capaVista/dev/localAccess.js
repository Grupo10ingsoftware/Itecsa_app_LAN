export const localOrigin = 'http://127.0.0.1:5173'
export const localPort = 5173

// Development and preview only. Production origins are supplied by the deployment.
export function localAccess() {
  const configure = server => {
    server.middlewares.use((req, res, next) => {
      const host = req.headers.host?.toLowerCase()
      if (host === `127.0.0.1:${localPort}`) return next()
      res.setHeader('Cache-Control', 'no-store')
      if (host === `localhost:${localPort}` && ['GET', 'HEAD'].includes(req.method)
        && req.url?.startsWith('/')) {
        res.statusCode = 307
        res.setHeader('Location', localOrigin + req.url)
        return res.end()
      }
      res.statusCode = 421
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`Accede al sistema mediante ${localOrigin}/kanban`)
    })
    // Docker's bind address is not the browser's public origin.
    server.printUrls = () => server.config.logger.info(`  ➜  ITECSA: ${localOrigin}/kanban`)
  }
  return {
    name: 'itecsa-local-access',
    configResolved(config) {
      if (config.command !== 'serve') return
      const options = config.isPreview ? config.preview : config.server
      if (options.port !== localPort || !options.strictPort || !['127.0.0.1', '0.0.0.0'].includes(options.host)) {
        throw Error(`El entorno local requiere el puerto ${localPort} fijo y host 127.0.0.1 (Node) o 0.0.0.0 (Docker).`)
      }
    },
    configureServer: configure,
    configurePreviewServer: configure,
  }
}
