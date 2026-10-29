#!/usr/bin/env node
// ============================================================
// ¿Algún archivo nombra una marca o un recurso interno de Pow?
//
//   node scripts/nombres-internos.mjs <archivo>...
//
// La lista de nombres NO está en texto plano (este repo es público): se
// guarda el sha256 de cada uno. El script parte cada línea en palabras
// (letras, dígitos y `_`, sin distinguir mayúsculas; también cada parte
// separada por `_`) y compara el sha256 de cada palabra con la lista.
//
// Sale 1 y muestra `archivo:línea` (sin el contenido, para no imprimir el
// nombre en un log público) si encuentra alguno.
//
// Para sumar un nombre:  printf '%s' 'nombre' | sha256sum
// y pegá el hash en PROHIBIDOS (en minúscula el nombre, sin espacios).
// ============================================================
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROHIBIDOS = new Set([
  'b9043c16af362f30807deaf692025d61c3c803bba1efc43fe2f63dc8b507418d',
  '6a14b20875e59e35cae0cba72e8ca9ea937789970ce7ba2e3acbc5250af98b4b',
  '12a0e9881cb7391aff6a1b7cf95f742ed207fd824beeb32a9a645dff2bae3fc9',
  '5a44039a3efc17e6c4469c86758986dcf8cf814abe54be6817767e0179fa03a1',
  '0a4346f806b28b3ce94905c3ac56fcd5ee2337d8613161696aba52eb0c3551cc',
  '380d77abcbcbf2a05d83b08cf9ec7e41b92fa8a2fea022a65111f72337c0e168',
  'dda8b9e8417112e087011590a196106ba0ad724cb62367ab71f12dd0f3fbb10a',
  '9c4bf41fc888542d8dd2b034224f54627f25f8b165c1cfd0be95143c343712ba',
  '7cc7eae5fad24d70f6a849974c1b9bf6b3e0d3a87c28cc9236dae00cb0e05cf4',
  'b27c85fc49ae7eec6256160209c69fcfc15f34a488c0fbe9ca42c690b91fc1c1',
  '8844588a4c9a51fca1456375864caf42887ced47f96f010e0bb9a4a08fd0fda0',
  '1b38e7a89c844da1e68f139b2fcc2c62a715cfffe82bcb982ea2048273264a3d',
  '580045de80c87af4a7b4169e02fe6061f144aafc67bfe7f3c087758accfa8cd0',
]);

const cache = new Map();
const prohibida = (palabra) => {
  let r = cache.get(palabra);
  if (r === undefined) {
    r = PROHIBIDOS.has(createHash('sha256').update(palabra).digest('hex'));
    cache.set(palabra, r);
  }
  return r;
};

const hallados = [];
for (const archivo of process.argv.slice(2)) {
  let buf;
  try {
    buf = readFileSync(archivo);
  } catch {
    continue;
  }
  if (buf.includes(0)) continue; // binario
  const lineas = buf.toString('utf8').split('\n');
  lineas.forEach((linea, i) => {
    for (const m of linea.toLowerCase().matchAll(/[a-z0-9_]+/g)) {
      const palabra = m[0];
      const partes = palabra.includes('_') ? [palabra, ...palabra.split('_')] : [palabra];
      if (partes.some((p) => p && prohibida(p))) {
        hallados.push(`${archivo}:${i + 1}`);
        return;
      }
    }
  });
}

if (hallados.length) {
  for (const h of hallados) console.log(`${h}: nombre interno (marca o recurso de Pow)`);
  process.exit(1);
}
