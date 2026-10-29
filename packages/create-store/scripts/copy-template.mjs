// prepack: copia el starter/ de la raíz del repo en ./template (sin node_modules, .next, .env,
// lockfile…), con .gitignore → _gitignore para que npm no lo borre al publicar.
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { copiarTemplate } from '../dist/template.js';

const origen = fileURLToPath(new URL('../../../starter', import.meta.url));
const destino = fileURLToPath(new URL('../template', import.meta.url));
await rm(destino, { recursive: true, force: true });
await copiarTemplate(origen, destino, { gitignoreComo: '_gitignore' });
console.log(`template copiado de ${origen}`);
