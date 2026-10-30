import { Ctx } from './context';

/**
 * Las versiones de Node que soportan las dependencias de los templates (Next,
 * vitest, eslint): 20 (desde 20.9), 22 y 24 en adelante. Las impares que no
 * son LTS (21, 23) disparan EBADENGINE al instalar vitest/eslint, y las
 * viejas (18) no corren Next 16.
 */
export function nodeSoportado(version: string): boolean {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  if (!Number.isFinite(major)) return true;
  if (major === 20) return (minor ?? 0) >= 9;
  return major === 22 || major >= 24;
}

/** El aviso para una versión de Node no soportada (null si está bien). */
export function avisoDeNode(version: string): string | null {
  if (nodeSoportado(version)) return null;
  const v = version.replace(/^v/, '');
  return `⚠ Estás con Node ${v}; recomendamos Node 22 LTS (o 20/24). Con otras versiones la instalación puede fallar (EBADENGINE) o la tienda no levantar.`;
}

/**
 * Para que `hermes create` no avise dos veces: el generador (create-store)
 * hace el mismo chequeo y lo saltea si la CLI ya avisó.
 */
export const VAR_NODE_AVISADO = 'HERMES_NODE_AVISADO';

/** Avisa por stderr (no corta nada). Devuelve si avisó. */
export function avisarNode(ctx: Ctx): boolean {
  const aviso = avisoDeNode(ctx.nodeVersion ?? process.versions.node);
  if (!aviso) return false;
  ctx.err(aviso);
  return true;
}
