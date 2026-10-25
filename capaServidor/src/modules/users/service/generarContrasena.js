import { randomInt } from 'node:crypto';

export function generarContrasena(longitud = 16) {
  if (!Number.isInteger(longitud) || longitud < 8) {
    throw new Error('La longitud mínima es de 8 caracteres');
  }

  const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const especiales = '!@#$%&*?';
  const grupos = [mayusculas, minusculas, numeros, especiales];
  const seleccionar = caracteres => caracteres[randomInt(caracteres.length)];
  const contrasena = grupos.map(seleccionar);
  const disponibles = grupos.join('');

  while (contrasena.length < longitud) {
    contrasena.push(seleccionar(disponibles));
  }

  for (let i = contrasena.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [contrasena[i], contrasena[j]] = [contrasena[j], contrasena[i]];
  }

  return contrasena.join('');
}
