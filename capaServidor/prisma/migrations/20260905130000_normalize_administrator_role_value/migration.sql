UPDATE `Usuario`
SET `rol_usuario` = 'Administrador Produccion'
WHERE BINARY `rol_usuario` IN ('Administrador', 'Administrador Producción');
