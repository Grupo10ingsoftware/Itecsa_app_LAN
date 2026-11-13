import { copyFile } from 'node:fs/promises'
// Keycloak sirve recursos propios. Esta copia se genera desde el mismo CSS que React.
await copyFile(new URL('../shared/loading/indicator.css', import.meta.url),
  new URL('../deploy/keycloak/themes/itecsa/login/resources/css/loading.css', import.meta.url))
// A direct theme installation also needs the Spanish text when Keycloak falls
// back to English (for example, before the realm locale has been configured).
await copyFile(new URL('../deploy/keycloak/themes/itecsa/login/messages/messages_es.properties', import.meta.url),
  new URL('../deploy/keycloak/themes/itecsa/login/messages/messages_en.properties', import.meta.url))
