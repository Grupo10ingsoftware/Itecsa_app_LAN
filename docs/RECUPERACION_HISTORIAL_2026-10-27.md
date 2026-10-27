# Auditoría y recuperación del historial remoto — 27 de octubre de 2026

## Punto de partida y método

- `origin/main` al iniciar: `87f42483950318986d29454eec4b57be99194dba`. Respaldo: etiqueta `recovery-main-before-consolidation-87f4248`.
- Se inspeccionaron las 8 ramas remotas, las 12 referencias de PR publicadas por GitHub, los commits alcanzables y el reflog y objetos no alcanzables de esta copia local. El grafo remoto tenía 40 commits alcanzables desde `main` y 9 adicionales en otras ramas. Se compararon ancestros, árboles, diffs y `patch-id`; los merges sin cambio de árbol no se tomaron como funcionalidad nueva.
- La rama de integración parte del SHA respaldado. Los archivos sin seguimiento del checkout local permanecieron fuera del worktree.
- El reflog local registra `fetch -p: forced-update` para `origin/mysqlLAN` el 27 de octubre. El PR #8 se había integrado en esa rama, pero el historial de `mysqlLAN` usado en el PR #10 partió de `6f0787f`, sin el merge `603e62b`. El reflog prueba la actualización no lineal observada; no identifica quién la hizo ni con qué comando.

## Ramas remotas

| Rama | Cambios encontrados frente a `main` | Estado | Acción |
|---|---|---|---|
| `main` | Base `87f4248` | Respaldo | Sin modificar; PR de recuperación pendiente de revisión. |
| `POC/KEYCLOAK` | Seis commits exclusivos: cuatro cambios de MySQL, CI y Docker web, más dos merges sin cambios adicionales de árbol. | Recuperado | Cherry-pick de `b17ff10`, `b2e7ef7`, `30c206c` y `406546f`; sin merge completo de la rama antigua. |
| `opt-kanban` | `2ba7a9b`: lecturas y transiciones Kanban, carga de producción, frontend y pruebas de rendimiento. | Recuperado | Cherry-pick completo; no hubo conflictos. |
| `dev` | Un merge exclusivo, `10a3f63`, con árbol idéntico a su segundo padre `4b16a3b`, ya ancestro de `main`. | Ya presente | Omitido para evitar incorporar historia antigua sin cambio de contenido. |
| `fix/merge` | Un merge exclusivo, `50e9f28`, con árbol idéntico a `849d425`, ya ancestro de `main`. | Ya presente | Omitido. |
| `mysqlLAN` | Ningún commit exclusivo; su punta `39a413a` ya es ancestro de `main`. | Ya presente | Omitido; se recuperó por separado el historial anterior perdido. |
| `feat/estados-carga-sebastian` | Ningún commit exclusivo. | Ya presente | Omitido. |
| `feat/finalización-y-PIN-VENTAS` | Ningún commit exclusivo; integrado por PR #12. | Ya presente | Omitido. |

## Pull requests y commits recuperables

| PR / commit | Cambios encontrados | Estado | Acción |
|---|---|---|---|
| #1 | Edición de usuarios y trabajo inicial de identidad. | Ya presente | Su punta `45beed2` es ancestro de `main`. |
| #2 | Integración de Keycloak en `dev`. | Ya presente | La punta `4b16a3b` es ancestro de `main`; el merge exclusivo no cambia el árbol. |
| #3 / `b17ff10` | Validación de despliegue MySQL autónomo, permisos de `instance.env` y entorno de laboratorio opcional. | Recuperado | Cherry-pick `587b14d`; producción sigue siendo el valor por defecto. |
| #4 | Integración anterior de `mysqlLAN` en `fix/merge`. | Ya presente | La punta `849d425` es ancestro de `main`; el merge exclusivo no cambia el árbol. |
| #5 | PR cerrado de Keycloak hacia `fix/merge`. | Ya presente | Punta `4b16a3b` en `main`; sin recuperación adicional. |
| #6 | Estados de carga. | Ya presente | Punta `ac9724a` en `main`. |
| #7 | Merge de `mysqlLAN` hacia `POC/KEYCLOAK`. | Recuperado por contenido | `c8bd525` tiene el mismo árbol que `603e62b`; sus cuatro cambios exclusivos se recuperaron individualmente. |
| #8 / `b2e7ef7`, `30c206c`, `406546f` | Retiro de CD a Northflank, eliminación del script obsoleto y build web independiente del prebuild del tema. | Recuperado | Cherry-picks `3b218a9`, `7f879ff` y `8f1f73e`; se conserva la verificación y publicación GHCR. |
| #9 | PR cerrado de `mysqlLAN` hacia `dev`. | Ya presente | Punta `fc0dc71` en `main` por #10. |
| #10 | Integración de `mysqlLAN` hacia `main`. | Ya presente | Punta `fc0dc71` en `main`; no incluía #8. |
| #11 | Cambio residual de interfaz. | Ya presente | Punta `39a413a` en `main`. |
| #12 | Finalización de pedidos y PIN de ventas. | Ya presente | Punta `e81a19e` en `main`. |
| `2ba7a9b` | Optimización Kanban aislada. | Recuperado | Cherry-pick `923f4fe`. |
| `11188d8` | Versión anterior a rebase del cambio MySQL. | Duplicado | Mismo `patch-id` que `b17ff10`; no se aplicó dos veces. |
| `a21eb23` / `bc9f51f` | Stash local de la ruta TLS CA y su índice sin cambios. | Ya presente | El diff de `a21eb23` coincide con `a4079ee`, ancestro de `main`; `bc9f51f` no altera el árbol. |

También se revisaron eliminaciones antiguas en la historia de `main`. La eliminación masiva de documentación, pruebas y herramientas en `fe2f7a3` fue explícita y está asociada al reemplazo de Auth0 por Keycloak; las pantallas, adaptadores y componentes posteriores eliminados tienen reemplazos en el árbol actual. Restaurar esos archivos sin adaptar sus contratos crearía implementaciones y suites contradictorias. No se incorporaron a esta recuperación.

## Validación y límites

- `git diff --check`: sin problemas. `git cherry -v` contra `POC/KEYCLOAK` y `opt-kanban`: los cinco commits de contenido exclusivo figuran como equivalentes en la rama de recuperación.
- API: 193 pruebas completas aprobadas; 62 pruebas dirigidas de MySQL, Kanban y finalización aprobadas. Prisma generó el cliente y validó el esquema.
- El primer check remoto detectó que el workflow ejecutaba las pruebas API antes de generar Prisma. Se corrigió el orden en los jobs de verificación y publicación para reproducir la secuencia local aprobada.
- El check de seguridad detectó `body-parser@2.3.0` (alta) y `qs@6.16.0` (moderada) en el lockfile previo del servidor. Se actualizaron a `2.4.0` y `6.17.0`; las auditorías locales de dependencias de runtime de servidor y web informan cero vulnerabilidades.
- Web: 206 pruebas aprobadas, lint y build aprobados. Dos pruebas de migración de páginas esperaban un aviso estático eliminado antes de esta rama; se actualizaron para comprobar el botón y el reintento que sí existen.
- Compose: `compose.yaml` y `compose.mysql.yaml` validaron estructura. Imágenes de producción web y API, y la imagen `database-tools`, construidas. No se ejecutó despliegue ni migración sobre bases de datos reales.
- La inspección alcanza las referencias que GitHub expuso y los objetos conservados en esta copia local. Commits de ramas borradas que GitHub haya purgado, o reflogs de otros clones, no se pueden descartar ni recuperar con esta evidencia. La validación de flujos con MySQL y Keycloak reales requiere un entorno aislado configurado; no se ejecutó aquí.
- El paquete de herramientas Prisma mantiene avisos de desarrollo por debajo del umbral crítico del check actual (uno moderado y tres altos). Actualizar Prisma requiere una revisión de compatibilidad aparte; no afecta el audit de runtime de la API o la web.
