import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migrationsRoot = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
const expected = Object.freeze({
  "0_init": "34c502aa4b163bb204a6858f3bd9fed6cc8970c8cba9b2ef6836e0d62c803ce5",
  "20260814120000_remove_electronic_signatures": "b718dd43821ee3490b5ecc528b0e6f9dff4e5801454623aa3a11b7e375a0781f",
  "20260830100000_reconcile_aiven_pin_prerequisite": "58ea25a6afd36e4b41147aa94a9fc73e29d81b0d0ac4e0ebbafa29625358f2c8",
  "20260830103000_add_personal_pins": "dd0724c837ec9434876a0e36a9ad467bfbedfc71ff23b315b4550ebc0eb3f8f6",
  "20260901000000_reconcile_pre_september_schema": "962d9b666b3b6fe95517615fe852d0930e52988065080887e1c8b3eff0229833",
  "20260904160000_add_registry_observation": "b7d7bd1782f12158bc9183fecca0bea58687d9eb695e09fb6773b431989a4571",
  "20260904210000_add_daily_product_capacity": "1605e5f73dc6211d7272dc795a38624b5e1c84bef5689b348acf3b08770deac5",
  "20260905120000_rename_existing_roles": "06b2b6911cd25dbbafe795fc873262c7b939b4aa23943c5c893ec626c53c5609",
  "20260905130000_normalize_administrator_role_value": "1e6470e11dca796c190a5f0bab7eef49ffd243a10409ab3ea60392bd95591a51",
  "20260905140000_normalize_production_operator_role_value": "30b341299b34f350411cb9822e890df69f3ac4b305c31c1d7d80ade94c00150f",
  "202609260001_orders_integrity": "36bf816eed50bb51242fdf2cdf0a40bef61599cbadc1214f465024a5ad82fd44",
  "202609260002_security_hardening": "9b0e1ef7067f5634c234c4c677b8f9f7b5afb9bc0e1914d1f06d6813a1a8bd22",
  "202610020001_privacy_submission": "5bede09126c66a25e738bb0780bc18328823ed01a0a89880a9bab01d160b5c61",
  "202610020002_incident_report_audit": "9fc17d7e59125c762ba4f3e7726bd71e03713f537b08d347a8b042773f57b00f",
  "202610250001_keycloak_identity_preparation": "6f2a00a80bde20c9df464a6beb35144cfb14498102ab2e8089bfa10f33736238",
  "202610250002_initial_user_credentials": "6157c72c6dbd96e5c50aace6b16649466de6045cd992e3c78f233c4bc248e2eb",
});

test("la tarea de inicializacion fija exactamente la cadena Prisma provisional", () => {
  const directories = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(migrationsRoot, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, Object.keys(expected).sort());
  for (const directory of directories) {
    const sql = readFileSync(path.join(migrationsRoot, directory, "migration.sql"));
    assert.equal(createHash("sha256").update(sql).digest("hex"), expected[directory], directory);
  }
  assert.equal(existsSync(path.join(migrationsRoot, "migration_lock.toml")), false);
});
