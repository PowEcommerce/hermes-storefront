// prepack: copia los templates de la raíz del repo en ./templates/<nombre>
// (sin node_modules, .next, .env, lockfile…), con .gitignore → _gitignore
// para que npm no lo borre al publicar:
//   starter-demo/ → templates/demo      (el default)
//   starter/      → templates/skeleton
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { copiarTemplate } from '../dist/template.js';

const TEMPLATES = { demo: 'starter-demo', skeleton: 'starter' };

const destino = fileURLToPath(new URL('../templates', import.meta.url));
await rm(destino, { recursive: true, force: true });
// El template viejo (una sola carpeta `template/`, hasta 0.1.x), por si quedó de un pack anterior.
await rm(fileURLToPath(new URL('../template', import.meta.url)), { recursive: true, force: true });
for (const [nombre, carpeta] of Object.entries(TEMPLATES)) {
  const origen = fileURLToPath(new URL(`../../../${carpeta}`, import.meta.url));
  await copiarTemplate(origen, `${destino}/${nombre}`, { gitignoreComo: '_gitignore' });
  console.log(`template ${nombre} copiado de ${origen}`);
}
