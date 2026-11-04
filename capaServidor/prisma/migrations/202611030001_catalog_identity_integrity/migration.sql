-- Fresh installations only. No legacy identity or catalog conversion.
ALTER TABLE `ExternalIdentity` DROP FOREIGN KEY `ExternalIdentity_user_id_fkey`;
ALTER TABLE `Usuario`
  MODIFY `id_keycloak` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  ADD UNIQUE INDEX `usuario_keycloak_identity` (`id_usuario`, `id_keycloak`);
ALTER TABLE `ExternalIdentity`
  ADD UNIQUE INDEX `external_identity_user_subject` (`user_id`, `subject`),
  ADD CONSTRAINT `ExternalIdentity_user_id_fkey` FOREIGN KEY (`user_id`, `subject`)
    REFERENCES `Usuario` (`id_usuario`, `id_keycloak`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `Estado_Pedido`
  MODIFY `orden_kanban` INTEGER NOT NULL,
  ADD UNIQUE INDEX `Estado_Pedido_orden_kanban_key` (`orden_kanban`);
ALTER TABLE `Producto_Subproceso`
  MODIFY `orden_flujo` INTEGER NOT NULL,
  ADD UNIQUE INDEX `Producto_Subproceso_id_tipo_producto_orden_flujo_key` (`id_tipo_producto`, `orden_flujo`);
