import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    hkdfSync,
    randomBytes,
    randomInt,
    scrypt as scryptCallback,
    timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { identityKey, identityUserWhere } from '../../../database/identityBinding.js';
import getPrismaClient from "../../../database/prisma.js";
import {
    isActiveUserStatus,
} from "../../../config/userLifecycle.js";
import { BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../../../../../shared/authorization.js';


const scrypt = promisify(scryptCallback);
const PIN_PATTERN = /^\d{6}$/;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PIN_HASH_PREFIX = 'scrypt$v2$N=32768,r=8,p=3$';

export class PinServiceError extends Error {
    constructor(code, message, { status = 400, details } = {}) {
        super(message);
        this.name = "PinServiceError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function decodeSecret(value) {
    const normalized = String(value ?? "").trim();
    const decoded = Buffer.from(normalized, "base64");

    if (
        !normalized ||
        decoded.length !== 32 ||
        decoded.toString("base64").replace(/=+$/, "") !==
            normalized.replace(/=+$/, "")
    ) {
        throw new PinServiceError(
            "PIN_CONFIGURATION_ERROR",
            "PIN_SECRET debe contener exactamente 32 bytes codificados en base64.",
            { status: 500 },
        );
    }

    return decoded;
}

function deriveKey(secret, purpose) {
    return Buffer.from(
        hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from(purpose), 32),
    );
}

async function hashValue(value, salt = randomBytes(16), hardened = false) {
    const derived = await scrypt(value, salt, 32, hardened
        ? { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
        : { N: 16384, r: 8, p: 1 });

    return {
        hash: (hardened ? PIN_HASH_PREFIX : "") + Buffer.from(derived).toString("base64"),
        salt: salt.toString("base64"),
    };
}

async function matchesHash(value, hash, salt) {
    if (!hash || !salt) return false;

    const hardened = hash.startsWith(PIN_HASH_PREFIX);
    const encoded = hardened ? hash.slice(PIN_HASH_PREFIX.length) : hash;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return false;
    const expected = Buffer.from(encoded, "base64");
    const actual = Buffer.from(
        await scrypt(value, Buffer.from(salt, "base64"), expected.length, {
            N: hardened ? 32768 : 16384,
            r: 8,
            p: hardened ? 3 : 1,
            maxmem: 64 * 1024 * 1024,
        }),
    );

    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sixDigits() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function pinStatus(user) {
    return user.pin_accepted_at ? "active" : "pending_acknowledgement";
}

function assertActiveUser(user) {
    if (!user || !isActiveUserStatus(user.estado_usuario)) {
        throw new PinServiceError(
            "PIN_USER_UNAVAILABLE",
            "El titular del PIN no esta activo o no esta vinculado.",
            { status: 403 },
        );
    }
}

export class PinService {
    constructor({
        prisma,
        secret,
        now = () => new Date(),
    } = {}) {
        this.prisma = prisma;
        this.secretValue = secret;
        this.now = now;
    }

    get client() {
        return this.prisma ?? getPrismaClient();
    }

    get keys() {
        const root = decodeSecret(this.secretValue ?? process.env.PIN_SECRET);

        return {
            encryption: deriveKey(root, "itecsa-pin-encryption-v1"),
            fingerprint: deriveKey(root, "itecsa-pin-fingerprint-v1"),
        };
    }

    fingerprint(pin) {
        return createHmac("sha256", this.keys.fingerprint).update(pin).digest("hex");
    }

    encrypt(pin) {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.keys.encryption, iv);
        const ciphertext = Buffer.concat([
            cipher.update(pin, "utf8"),
            cipher.final(),
        ]);

        return {
            ciphertext: ciphertext.toString("base64"),
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
        };
    }

    decrypt(user) {
        try {
            const decipher = createDecipheriv(
                "aes-256-gcm",
                this.keys.encryption,
                Buffer.from(user.pin_pending_iv, "base64"),
            );
            decipher.setAuthTag(Buffer.from(user.pin_pending_tag, "base64"));

            return Buffer.concat([
                decipher.update(Buffer.from(user.pin_pending_ciphertext, "base64")),
                decipher.final(),
            ]).toString("utf8");
        } catch {
            throw new PinServiceError(
                "PIN_PENDING_DATA_INVALID",
                "No fue posible recuperar el PIN pendiente.",
                { status: 500 },
            );
        }
    }

    async buildCredential() {
        const pin = sixDigits();
        const hashed = await hashValue(pin, randomBytes(16), true);
        const encrypted = this.encrypt(pin);

        return {
            pin,
            data: {
                pin_hash: hashed.hash,
                pin_salt: hashed.salt,
                pin_fingerprint: this.fingerprint(pin),
                pin_pending_ciphertext: encrypted.ciphertext,
                pin_pending_iv: encrypted.iv,
                pin_pending_tag: encrypted.tag,
                pin_accepted_at: null,
                pin_failed_attempts: 0,
                pin_locked_until: null,
            },
        };
    }

    async findUser(identitySubject, select) {
        return this.client.usuario.findFirst({
            where: identityUserWhere(identitySubject),
            ...(select ? { select } : {}),
        });
    }

    async findUserForUpdate(transaction, identitySubject) {
        const key = identityKey(identitySubject);
        const users = await transaction.$queryRaw`
            SELECT u.id_usuario, u.correo_usuario, u.nombre_usuario,
                u.apellido_usuario, u.rol_usuario, u.estado_usuario, u.pin_hash, u.pin_salt,
                u.pin_accepted_at, u.pin_failed_attempts, u.pin_locked_until
            FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
            WHERE e.provider = ${key.provider} AND e.issuer = ${key.issuer} AND e.subject = ${key.subject}
            FOR UPDATE
        `;
        return users[0] ?? null;
    }

    async findPinOwnerForUpdate(transaction, identitySubject, pin) {
        const key = identityKey(identitySubject);
        const users = await transaction.$queryRaw`
            SELECT u.id_usuario, u.correo_usuario, u.nombre_usuario,
                u.apellido_usuario, u.rol_usuario, u.estado_usuario, u.pin_hash,
                u.pin_salt, u.pin_accepted_at, u.pin_failed_attempts, u.pin_locked_until
            FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
            WHERE u.pin_fingerprint = ${this.fingerprint(pin)}
                AND e.provider = ${key.provider} AND e.issuer = ${key.issuer}
            FOR UPDATE
        `;
        return users[0] ?? null;
    }

    async provisionByUserId(userId) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const credential = await this.buildCredential();

            try {
                const result = await this.client.usuario.updateMany({
                    where: { id_usuario: Number(userId), pin_hash: null },
                    data: credential.data,
                });

                if (result.count === 1) return "pending_acknowledgement";

                const current = await this.client.usuario.findUnique({
                    where: { id_usuario: Number(userId) },
                });

                return current ? pinStatus(current) : null;
            } catch (error) {
                if (error?.code !== "P2002") throw error;
            }
        }

        throw new PinServiceError(
            "PIN_GENERATION_FAILED",
            "No fue posible generar un PIN unico.",
            { status: 500 },
        );
    }

    async ensureProvisioned(identitySubject) {
        const select = { id_usuario: true, estado_usuario: true, pin_hash: true, pin_accepted_at: true };
        let user = await this.findUser(identitySubject, select);
        assertActiveUser(user);

        if (!user.pin_hash) {
            await this.provisionByUserId(user.id_usuario);
            user = await this.findUser(identitySubject, select);
        }

        return pinStatus(user);
    }

    async reveal(identitySubject) {
        const user = await this.findUser(identitySubject, {
            estado_usuario: true, pin_accepted_at: true,
            pin_pending_ciphertext: true, pin_pending_iv: true, pin_pending_tag: true,
        });
        assertActiveUser(user);

        if (
            user.pin_accepted_at ||
            !user.pin_pending_ciphertext ||
            !user.pin_pending_iv ||
            !user.pin_pending_tag
        ) {
            throw new PinServiceError(
                "PIN_NOT_REVEALABLE",
                "El PIN ya no puede volver a mostrarse.",
                { status: 409 },
            );
        }

        return this.decrypt(user);
    }

    async acknowledge(identitySubject) {
        const user = await this.findUser(identitySubject, {
            id_usuario: true, estado_usuario: true, pin_hash: true, pin_accepted_at: true,
        });
        assertActiveUser(user);

        if (!user.pin_hash) {
            throw new PinServiceError(
                "PIN_NOT_PROVISIONED",
                "El usuario aun no tiene un PIN.",
                { status: 409 },
            );
        }

        if (user.pin_accepted_at) return;

        await this.client.usuario.update({
            where: { id_usuario: user.id_usuario },
            data: {
                pin_accepted_at: this.now(),
                pin_pending_ciphertext: null,
                pin_pending_iv: null,
                pin_pending_tag: null,
            },
        });
    }

    assertPinFormat(pin) {
        if (!PIN_PATTERN.test(String(pin ?? ""))) {
            throw new PinServiceError(
                "PIN_FORMAT_INVALID",
                "El PIN debe contener seis digitos.",
            );
        }
    }

    async validateLockedPin(transaction, user, pin) {
        assertActiveUser(user);
        if (!user.pin_hash || !user.pin_accepted_at) {
            return {
                error: new PinServiceError(
                    "PIN_NOT_ACKNOWLEDGED",
                    "Debes recibir y aceptar tu PIN antes de usarlo.",
                    { status: 403 },
                ),
            };
        }

        const now = this.now();
        if (user.pin_locked_until && user.pin_locked_until > now) {
            return {
                error: new PinServiceError(
                    "PIN_LOCKED",
                    "El PIN esta temporalmente bloqueado.",
                    {
                        status: 423,
                        details: {
                            retryAfterSeconds: Math.ceil(
                                (user.pin_locked_until - now) / 1000,
                            ),
                        },
                    },
                ),
            };
        }

        const valid = await matchesHash(pin, user.pin_hash, user.pin_salt);
        if (!valid) {
            const attempts = (user.pin_failed_attempts ?? 0) + 1;
            const lockedUntil = attempts >= MAX_ATTEMPTS
                ? new Date(now.getTime() + LOCK_MS)
                : null;

            await transaction.usuario.update({
                where: { id_usuario: user.id_usuario },
                data: {
                    pin_failed_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
                    pin_locked_until: lockedUntil,
                },
            });

            return {
                error: new PinServiceError(
                    "PIN_INVALID",
                    "El PIN ingresado no es valido.",
                    { status: 403 },
                ),
            };
        }

        if (user.pin_failed_attempts || user.pin_locked_until) {
            await transaction.usuario.update({
                where: { id_usuario: user.id_usuario },
                data: { pin_failed_attempts: 0, pin_locked_until: null },
            });
        }

        return {
            user: {
                idUsuario: user.id_usuario,
                correoUsuario: user.correo_usuario,
                nombreUsuario: user.nombre_usuario,
                apellidoUsuario: user.apellido_usuario,
                rolUsuario: user.rol_usuario,
            },
        };
    }

    async validate(identitySubject, pin) {
        this.assertPinFormat(pin);
        const result = await this.client.$transaction(async (transaction) => {
            const user = await this.findUserForUpdate(transaction, identitySubject);
            return this.validateLockedPin(transaction, user, pin);
        });

        if (result.error) throw result.error;
        return result.user;
    }

    async validateForPermission(identitySubject, pin, permission) {
        if (!BUSINESS_PERMISSIONS.includes(permission)) throw new TypeError('Capacidad desconocida.');
        this.assertPinFormat(pin);
        const result = await this.client.$transaction(async (transaction) => {
            const user = await this.findPinOwnerForUpdate(transaction, identitySubject, pin);
            if (!user) {
                // Unknown PINs take a comparable hash cost without scanning users.
                await hashValue(pin, Buffer.alloc(16), true);
                return { error: new PinServiceError('PIN_INVALID', 'El PIN ingresado no es valido.', { status: 403 }) };
            }
            const validated = await this.validateLockedPin(transaction, user, pin);
            if (validated.error) return validated;
            const permissions = ROLE_PERMISSIONS[user.rol_usuario];
            if (!permissions?.includes(permission)) {
                return { error: new PinServiceError('PIN_ACTOR_FORBIDDEN', 'El titular del PIN no tiene autorizacion para esta accion.', { status: 403 }) };
            }
            return { user: { ...validated.user, permissions } };
        });
        if (result.error) throw result.error;
        return result.user;
    }

    async rotateAfterRecovery(identitySubject, authorize) {
        const user = await this.findUser(identitySubject, { estado_usuario: true });
        assertActiveUser(user);
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const credential = await this.buildCredential();
            try {
                const changed = await this.client.$transaction(async (transaction) => {
                    const current = await this.findUserForUpdate(transaction, identitySubject);
                    assertActiveUser(current);
                    if (await matchesHash(credential.pin, current.pin_hash, current.pin_salt)) return false;
                    authorize();
                    await transaction.usuario.update({ where: { id_usuario: current.id_usuario }, data: credential.data });
                    return true;
                });
                if (changed) return 'pending_acknowledgement';
            } catch (error) {
                if (error?.code !== 'P2002') throw error;
            }
        }
        throw new PinServiceError('PIN_GENERATION_FAILED', 'No fue posible generar un PIN unico.', { status: 500 });
    }

    async invalidateBySubject(identitySubject) {
        const user = await this.findUser(identitySubject);
        if (!user) return;

        await this.client.$transaction([
            this.client.usuario.update({
                where: { id_usuario: user.id_usuario },
                data: {
                    pin_hash: null,
                    pin_salt: null,
                    pin_fingerprint: null,
                    pin_pending_ciphertext: null,
                    pin_pending_iv: null,
                    pin_pending_tag: null,
                    pin_accepted_at: null,
                    pin_failed_attempts: 0,
                    pin_locked_until: null,
                },
            }),
        ]);
    }
}

export default new PinService();
