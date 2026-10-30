# Evidencia de conexiones — 30-10-2026

Todas las duraciones están en ms. Ningún archivo contiene cuerpos HTTP, filas de negocio, parámetros SQL, contraseñas, PIN ni tokens. Los identificadores de conexión son ordinales locales al observador, no identidades de usuario. Los callbacks del driver incluyen transporte y decodificación; no son tiempos puros de motor.

| Archivos | Uso y condición |
| --- | --- |
| `entorno-activo.json`, `config-pool.json`, `config-final.json` | Configuración y versiones del proceso API, hash del destino sin publicarlo, opciones del pool vivo y hashes del producto. `config-efectiva.json` es una captura exploratoria cuyo listado de pools quedó vacío por limitación del observador; no prueba ausencia de pool. |
| `prisma-pool-completo.json` | Serie de referencia: 20 SELECT 1 calientes con adquisición, ping y driver correlacionados. |
| `pool-pares.json` | Diez pares simultáneos; eventos correlacionados por par, sin atribución a consulta individual. |
| `http-usuarios-final.json`, `http-cobranzas-final.json`, `http-perfil-final.json` | Línea continua final, 20 respuestas 200 por recorrido, después de terminar los ensayos directos. Mismo actor, rutas y filtros por serie. La primera solicitud de Cobranzas renueva catálogo (4 SELECT); las restantes tienen 3. |
| `http-live-valido.json` | 20 respuestas 200 del endpoint sin DB, instrumento corregido. |
| `http-cobranzas-extra-caliente.json` | Muestra adicional 200 tras pausa; 2878,723 ms. Catálogo caliente, intervalo previo a identidad 1384,899 ms sin comunicación Keycloak instrumentada, y timeout de ping. No se mezcla con la serie continua para ocultar su variación ni se atribuye su espera inicial definitivamente a JWKS. |
| `http-usuarios-primera.json`, `http-cobranzas-primera.json`, `perfil-inicial-valido.json`, `perfil-renovado.json` | Primeras peticiones o comprobaciones de sesión, separadas de la línea final. No son un reinicio frío del proceso. |
| `http-usuarios.json`, `http-cobranzas.json`, `http-perfil.json` | Series exploratorias válidas. Parte de Cobranzas/Perfil coincidió con el ensayo directo; no agregar sus muestras a los 20 finales. |
| `directo-exacto.json` | Ensayo complementario de conexiones nuevas, TLS, COUNT real, texto/binario, caché diagnóstica y comparación alternada driver/Prisma. Motor: hilo propio + **igualdad exacta de SQL_TEXT**. Valores null significan no instrumentado; las ejecuciones binarias no dieron un evento exacto. Hubo tráfico HTTP de baja intensidad de otra sesión durante parte del ensayo: no es una medición sin otra actividad. |
| `keycloak-activo.json` | Token, descubrimiento y 20 GET administrativos de catálogo desde API; JWT con JWKS frío/caliente. Token de servicio, sin administrar cuentas. |
| `resumen.json` | Derivado reproducible mediante `auditConnections.summarize.mjs`. p95 por rango más cercano solo n≥20. Las cohortes de catálogo no implican el mismo estado JWKS; la cohorte caliente combinada incluye la muestra tras pausa. No usar ese agregado como baseline homogéneo JWT caliente. |
| `retirada-instrumentacion.json`, `verificacion-restauracion.json` | Retirada de wrappers/token, ausencia de globals y restauración de métodos originales. |
| `smoke-final.json`, `servicios-finales.json`, `validacion-final.json` | Liveness 200, protección sin JWT 401, mismos PID, inspector cerrado, checks, hashes del producto y saneamiento. |

Archivos exploratorios **excluidos de las conclusiones que no pueden sostener**:

- `http-live.json`, `perfil-inicial-error.json`: 500 causados por un wrapper temporal de `res.json` instalado antes de que Express lo inicializara. No son fallos del producto; se retiró ese wrapper y se repitió con 200.
- `prisma-activo.json`: primera observación y consultas sin eventos correlacionados. Solo acredita su reloj completo; no separa pool/driver.
- `prisma-activo-correlacionado.json`: pings/driver observados, pero faltó adquisición; se repitió como `prisma-pool-completo.json`.
- `directo.json`: la búsqueda preliminar de historial por LIKE podía coincidir con la consulta anterior de diagnóstico cuando SQL_TEXT del preparado es null. **No usar sus tiempos atribuidos a motor**. Los tiempos cliente, TCP/TLS y contadores siguen siendo observaciones de esa ejecución preliminar y no se agregan a `directo-exacto.json`.

No se sobrescribieron las evidencias anteriores de Usuarios o Cobranzas. Las escrituras vistas después de HTTP son la auditoría normal de seguridad del actor autorizado; no se ejecutaron mutaciones de negocio, limpieza de registros, cambios de PIN/cuenta ni deshabilitación de controles.
