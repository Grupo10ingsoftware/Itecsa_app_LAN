import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveDatabaseConnection } from "../src/database/connectionConfig.js";

const temporary = mkdtempSync(path.join(tmpdir(), "itecsa-db-config-"));
const caPath = path.join(temporary, "ca.pem");
writeFileSync(caPath, "synthetic test CA\n");
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));

function base(overrides = {}) {
    const env = {
        APP_ENV: "development",
        DB_HOST: "db.example.invalid",
        DB_PORT: "3306",
        DB_USER: "api_user",
        DB_PASSWORD: "api-secret",
        DB_NAME: "itecsa_lab",
        DB_SSL_MODE: "required",
        DB_SSL_CA_PATH: caPath,
        ...overrides,
    };
    const url = new URL("mysql://cli_user:cli-secret@db.example.invalid:3306/itecsa_lab");
    url.searchParams.set("sslcert", env.DB_SSL_CA_PATH);
    url.searchParams.set("sslaccept", "strict");
    env.DATABASE_URL = overrides.DATABASE_URL ?? url.href;
    return env;
}

test("API and CLI may use different accounts for the same TLS destination", () => {
    const result = resolveDatabaseConnection(base(), { requireUrl: true });
    assert.equal(result.user, "api_user");
    assert.equal(result.database, "itecsa_lab");
    assert.match(result.ca, /synthetic test CA/);
});

test("rejects a different CLI host, port or database without exposing secrets", () => {
    for (const change of [
        (url) => { url.hostname = "other.example.invalid"; },
        (url) => { url.port = "3307"; },
        (url) => { url.pathname = "/other_db"; },
    ]) {
        const env = base();
        const url = new URL(env.DATABASE_URL);
        change(url);
        env.DATABASE_URL = url.href;
        assert.throws(() => resolveDatabaseConnection(env), (error) =>
            /destinos distintos/.test(error.message) && !error.message.includes("api-secret"));
    }
});

test("requires a complete destination and an explicit URL for CLI", () => {
    const env = base();
    delete env.DB_NAME;
    assert.throws(() => resolveDatabaseConnection(env), /faltan DB_NAME/);
    const withoutUrl = base();
    delete withoutUrl.DATABASE_URL;
    assert.throws(() => resolveDatabaseConnection(withoutUrl, { requireUrl: true }), /DATABASE_URL es obligatorio/);
    assert.throws(() => resolveDatabaseConnection(base({ DATABASE_URL: "" })), /DATABASE_URL no puede estar vacio/);
    assert.equal(resolveDatabaseConnection({}, { allowUnconfigured: true, requireUrl: true }), null);
});

test("TLS requires a readable CA and strict CLI validation", () => {
    const missingCa = base({ DB_SSL_CA_PATH: path.join(temporary, "missing.pem") });
    assert.throws(() => resolveDatabaseConnection(missingCa), /no se pudo leer la CA/);
    const weakCli = base();
    weakCli.DATABASE_URL = weakCli.DATABASE_URL.replace("sslaccept=strict", "sslaccept=accept_invalid_certs");
    assert.throws(() => resolveDatabaseConnection(weakCli), /sslaccept=strict/);
    const duplicate = base();
    duplicate.DATABASE_URL += "&sslaccept=accept_invalid_certs";
    assert.throws(() => resolveDatabaseConnection(duplicate), /duplicadas/);
});

test("unencrypted connections remain limited to the test environment", () => {
    const env = base({ DB_SSL_MODE: "disabled" });
    env.DATABASE_URL = "mysql://cli_user:cli-secret@db.example.invalid:3306/itecsa_lab";
    assert.throws(() => resolveDatabaseConnection(env), /APP_ENV=test/);
    env.APP_ENV = "test";
    assert.equal(resolveDatabaseConnection(env).sslMode, "disabled");
});

test("laboratory profile pins its address and requires its URL", () => {
    const env = base({ DB_TARGET: "mysql-lab-docker" });
    assert.throws(() => resolveDatabaseConnection(env), /DB_HOST=mysql/);
    env.DB_HOST = "mysql";
    const url = new URL(env.DATABASE_URL);
    url.hostname = "mysql";
    env.DATABASE_URL = url.href;
    assert.equal(resolveDatabaseConnection(env).host, "mysql");
    delete env.DATABASE_URL;
    assert.throws(() => resolveDatabaseConnection(env), /DATABASE_URL es obligatorio/);
});

test("a selected missing environment file fails instead of falling back", () => {
    const env = base({ DOTENV_PATH: path.join(temporary, "missing.env") });
    assert.throws(() => resolveDatabaseConnection(env), /no se encontro el archivo/);
});
