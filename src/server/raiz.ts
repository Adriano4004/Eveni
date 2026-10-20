import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raiz do projecto, quer a correr com tsx (src/server/) quer compilado (dist/server/server/).
const pastaDesteFicheiro = dirname(fileURLToPath(import.meta.url));
const compilado = pastaDesteFicheiro.endsWith(join('dist', 'server', 'server'));
export const RAIZ = join(pastaDesteFicheiro, compilado ? '../../..' : '../..') + sep;
