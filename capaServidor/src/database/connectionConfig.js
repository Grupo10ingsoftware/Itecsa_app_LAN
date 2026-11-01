import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const databaseKeys = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const dockerTargets = new Set(["mysql-docker", "mysql-lab-docker"]);
const labTargets = new Set(["mysql-lab-host", ...dockerTargets]);

function invalid(message) {
    throw new Error(`Configuracion de base de datos invalida: ${message}`);
}

export function createStrictTlsOptions(host, ca, { checkServerIdentity = tls.checkServerIdentity } = {}) {
    return {
        ca,
        rejectUnauthorized: true,
        // mariadb upgrades an existing TCP socket. Without this callback Node
        // authorizes that socket as "localhost" instead of the selected host.
        checkServerIdentity: (_socketHost, certificate) => checkServerIdentity(host, certificate),
    };
}

export function assertSelectedEnvironmentFile(env = process.env) {
    if (!env.DOTENV_PATH) return;
    try {
        if (fs.statSync(env.DOTENV_PATH).isFile()) {
            fs.accessSync(env.DOTENV_PATH, fs.constants.R_OK);
            return;
        }
    } catch { /* File unavailable. */ }
    invalid("no se encontro el archivo de entorno seleccionado.");
}

export function resolveDatabaseConnection(env = process.env, { allowUnconfigured = false, requireUrl = false } = {}) {
    assertSelectedEnvironmentFile(env);

    const configured = databaseKeys.some((key) => env[key] !== undefined) ||
        env.DATABASE_URL !== undefined || env.DB_TARGET !== undefined;
    if (!configured && allowUnconfigured) {
        if (env.APP_ENV === "production") invalid("produccion requiere DB_TARGET=mysql-docker.");
        return null;
    }

    const missing = databaseKeys.filter((key) => !env[key]?.trim());
    if (missing.length) invalid(`faltan ${missing.join(", ")}.`);

    const host = env.DB_HOST.trim();
    const port = Number(env.DB_PORT);
    const user = env.DB_USER.trim();
    const database = env.DB_NAME.trim();
    if (!Number.isInteger(port) || port < 1 || port > 65535) invalid("DB_PORT debe ser un puerto TCP valido.");

    const target = env.DB_TARGET?.trim();
    if (env.DB_TARGET !== undefined && !target) invalid("DB_TARGET no puede estar vacio.");
    if (env.APP_ENV === "production" && target !== "mysql-docker") invalid("produccion requiere DB_TARGET=mysql-docker.");
    if (!target) invalid("DB_TARGET debe seleccionar un perfil MySQL local.");
    if (target && !labTargets.has(target)) invalid("DB_TARGET no es un perfil MySQL local valido.");
    if (target === "mysql-lab-host" && host !== "127.0.0.1") invalid("el perfil de computador requiere DB_HOST=127.0.0.1.");
    if (dockerTargets.has(target) && host !== "mysql") invalid("el perfil Docker requiere DB_HOST=mysql.");

    const sslMode = env.DB_SSL_MODE ?? "required";
    if (sslMode !== "required" && sslMode !== "disabled") invalid("DB_SSL_MODE debe ser required o disabled.");
    if (sslMode === "disabled" && env.APP_ENV !== "test") invalid("TLS solo puede desactivarse en APP_ENV=test.");

    let ca;
    if (sslMode === "required") {
        if (!env.DB_SSL_CA_PATH?.trim()) invalid("DB_SSL_CA_PATH es obligatorio para TLS.");
        const caPath = path.isAbsolute(env.DB_SSL_CA_PATH)
            ? env.DB_SSL_CA_PATH : path.resolve(serverRoot, env.DB_SSL_CA_PATH);
        try {
            ca = fs.readFileSync(caPath, "utf8");
            if (!ca.trim()) invalid("la CA de MySQL esta vacia.");
        } catch {
            invalid("no se pudo leer la CA de MySQL.");
        }
    }

    const urlValue = env.DATABASE_URL?.trim();
    if (env.DATABASE_URL !== undefined && !urlValue) invalid("DATABASE_URL no puede estar vacio.");
    if (!urlValue && requireUrl) invalid("DATABASE_URL es obligatorio para este perfil.");
    if (urlValue) {
        let url;
        try { url = new URL(urlValue); } catch { invalid("DATABASE_URL no es una URL valida."); }
        if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.password ||
            !url.pathname || url.pathname === "/" || url.hash) invalid("DATABASE_URL debe ser una URL MySQL completa.");

        let urlDatabase;
        try { urlDatabase = decodeURIComponent(url.pathname.slice(1)); }
        catch { invalid("el nombre de base en DATABASE_URL no es valido."); }
        const urlPort = url.port ? Number(url.port) : 3306;
        if (url.hostname.toLowerCase() !== host.toLowerCase() || urlPort !== port || urlDatabase !== database) {
            invalid("DB_* y DATABASE_URL apuntan a destinos distintos.");
        }
        if (url.searchParams.getAll("sslcert").length > 1 || url.searchParams.getAll("sslaccept").length > 1) {
            invalid("DATABASE_URL contiene opciones TLS duplicadas.");
        }
        if (sslMode === "required" && (url.searchParams.get("sslaccept") !== "strict" ||
            url.searchParams.get("sslcert") !== env.DB_SSL_CA_PATH)) {
            invalid("DATABASE_URL debe usar la misma CA y sslaccept=strict.");
        }
        if (sslMode === "disabled" && (url.searchParams.has("sslcert") || url.searchParams.has("sslaccept"))) {
            invalid("DATABASE_URL no debe declarar TLS desactivado para este perfil de test.");
        }
    }

    return { host, port, user, password: env.DB_PASSWORD, database, sslMode, ca };
}
