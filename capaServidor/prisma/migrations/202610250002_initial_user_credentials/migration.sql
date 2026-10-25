ALTER TABLE `Usuario` ADD COLUMN `id_keycloak` VARCHAR(128) NULL;

UPDATE `Usuario` u
JOIN `ExternalIdentity` e ON e.user_id = u.id_usuario AND e.provider = 'keycloak'
SET u.id_keycloak = e.subject;

CREATE UNIQUE INDEX `Usuario_id_keycloak_key` ON `Usuario` (`id_keycloak`);
