import { copyFile } from 'node:fs/promises'
// Keycloak sirve recursos propios. Esta copia se genera desde el mismo CSS que React.
await copyFile(new URL('../shared/loading/indicator.css', import.meta.url),
  new URL('../deploy/keycloak/themes/itecsa/login/resources/css/loading.css', import.meta.url))
