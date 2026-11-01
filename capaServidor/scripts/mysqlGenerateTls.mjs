import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const certs = process.env.MYSQL_CERTS_PATH ?? "/output/certs";
const privatePath = process.env.MYSQL_PRIVATE_PATH ?? "/output/private";
const hostname = process.env.MYSQL_EXPECTED_HOSTNAME ?? "itecsa-mysql";
const outputs = [
  path.join(certs, "ca.pem"),
  path.join(certs, "server-cert.pem"),
  path.join(certs, "server-key.pem"),
];
const present = outputs.filter(fs.existsSync);
function normalizePermissions() {
  const uid = Number(process.env.MYSQL_OWNER_UID ?? process.getuid());
  const gid = Number(process.env.MYSQL_OWNER_GID ?? process.getgid());
  if (![uid, gid].every(v => Number.isInteger(v) && v >= 0)) throw Error('MYSQL_TLS: propietario invalido');
  for (const [file, mode] of [[certs, 0o700], [privatePath, 0o700],
    ...outputs.map((file, i) => [file, i === 2 ? 0o600 : 0o644]),
    [path.join(privatePath, 'ca-key.pem'), 0o600]]) {
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) throw Error('MYSQL_TLS: no se admiten enlaces simbolicos');
    if (process.getuid() === 0) fs.chownSync(file, uid, gid);
    fs.chmodSync(file, mode);
  }
}
if (present.length === outputs.length) {
  normalizePermissions();
  console.log("MYSQL_TLS: certificados existentes conservados.");
  process.exit(0);
}
if (present.length > 0) throw new Error("Configuracion TLS parcial; no se sobrescribiran certificados existentes.");

fs.mkdirSync(certs, { recursive: true, mode: 0o700 });
fs.mkdirSync(privatePath, { recursive: true, mode: 0o700 });
const caKey = path.join(privatePath, "ca-key.pem");
if (fs.existsSync(caKey)) throw new Error("Existe una clave CA sin el juego completo de certificados.");

function openssl(args) {
  const result = spawnSync("openssl", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`OpenSSL fallo: ${result.stderr.trim()}`);
}
const serverKey = outputs[2];
const csr = path.join(privatePath, "server.csr");
const extensions = path.join(privatePath, "server.ext");
fs.writeFileSync(extensions, `subjectAltName=DNS:mysql,DNS:${hostname}\nextendedKeyUsage=serverAuth\n`, { mode: 0o600 });
openssl(["genrsa", "-out", caKey, "4096"]);
openssl(["req", "-x509", "-new", "-nodes", "-key", caKey, "-sha256", "-days", "3650",
  "-subj", "/CN=ITECSA MySQL Private CA", "-out", outputs[0]]);
openssl(["genrsa", "-out", serverKey, "2048"]);
openssl(["req", "-new", "-key", serverKey, "-subj", `/CN=${hostname}`, "-out", csr]);
openssl(["x509", "-req", "-in", csr, "-CA", outputs[0], "-CAkey", caKey, "-CAcreateserial",
  "-out", outputs[1], "-days", "825", "-sha256", "-extfile", extensions]);
fs.rmSync(csr, { force: true });
fs.rmSync(extensions, { force: true });
fs.chmodSync(caKey, 0o600);
fs.chmodSync(serverKey, 0o600);
fs.chmodSync(outputs[0], 0o644);
fs.chmodSync(outputs[1], 0o644);
normalizePermissions();
console.log("MYSQL_TLS: CA y certificado de servidor generados.");
