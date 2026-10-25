-- Phase 06: additive only. Rehearse on a disposable clone before corporate use.
-- No backfill by email/name, no PK/FK replacement and no automatic provider switch.
ALTER TABLE `Usuario` MODIFY `correo_usuario` VARCHAR(255) NULL;

CREATE TABLE `ExternalIdentity` (
  `id_external_identity` INTEGER NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(20) NOT NULL,
  `issuer` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `subject` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `username` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `user_id` INTEGER NOT NULL,
  PRIMARY KEY (`id_external_identity`),
  UNIQUE INDEX `external_identity_user` (`user_id`),
  UNIQUE INDEX `external_identity_subject` (`provider`, `issuer`, `subject`),
  UNIQUE INDEX `external_identity_username` (`provider`, `issuer`, `username`),
  CONSTRAINT `ExternalIdentity_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `Usuario` (`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `IdentityProvisionOperation` (
  `id` CHAR(36) NOT NULL,
  `issuer` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `username` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `payload_digest` CHAR(64) NOT NULL,
  `input` JSON NOT NULL,
  `external_subject` VARCHAR(128) NULL,
  `local_user_id` INTEGER NULL,
  `state` VARCHAR(30) NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 0,
  `actor_user_id` INTEGER NOT NULL,
  `last_error` VARCHAR(80) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `identity_provision_username` (`issuer`, `username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
