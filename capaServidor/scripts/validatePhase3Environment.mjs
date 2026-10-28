import { writeFile } from 'node:fs/promises';
import { pinRecoveryConfiguration } from '../src/config/pinRecovery.js';
import { resolveIdentityConfiguration } from '../src/config/identity.js';
import { resolveDatabaseConnection } from '../src/database/connectionConfig.js';

const output = { reference: '1e7bddd', capturedAt: new Date().toISOString(), checks: {}, network: {},
    note: 'Public discovery/JWKS reads only. No login, refresh, management, mutation or PIN recovery. No secret values exported.' };
try { const c = resolveDatabaseConnection(); output.checks.database = { configured: true, strictTls: c.sslMode === 'required' }; }
catch { output.checks.database = { configured: false }; }
try { pinRecoveryConfiguration(); output.checks.pinRecoveryConfiguration = true; } catch { output.checks.pinRecoveryConfiguration = false; }
try {
    const config = resolveIdentityConfiguration();
    for (const [name, url] of [['discovery', config.issuer.replace(/\/$/, '') + '/.well-known/openid-configuration'], ['jwks', config.jwksUri]]) {
        const start = performance.now();
        try {
            const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(6000) });
            const data = response.ok ? await response.json() : null;
            output.network[name] = { status: response.status, ms: performance.now() - start, valid: name === 'discovery' ? data?.issuer === config.issuer : Array.isArray(data?.keys) && data.keys.length > 0 };
        } catch (error) { output.network[name] = { status: 'unreachable', ms: performance.now() - start, error: error.name, causeCode: error.cause?.code ?? null }; }
    }
} catch { output.checks.identityConfiguration = false; }
await writeFile('../docs/FASE3_ENTORNO.json', JSON.stringify(output, null, 2) + '\n');
