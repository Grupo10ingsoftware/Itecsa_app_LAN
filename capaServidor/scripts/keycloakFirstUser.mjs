// Compatibility entry point: INITIAL_ADMIN_* now prepares all three administrators.
import { runInitialAdministrators } from './keycloakInitialAdministrators.mjs';

await runInitialAdministrators();
