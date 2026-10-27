UPDATE `Usuario`
SET `rol_usuario` = 'Operario Produccion'
WHERE BINARY `rol_usuario` IN ('Producción', 'Operario Producción');
