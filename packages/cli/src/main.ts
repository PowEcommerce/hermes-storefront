import { ApiError } from './api';
import { Parsed, parseArgs } from './args';
import { Ctx, VERSION } from './context';
import { CliError } from './errors';
import { create } from './commands/create';
import { deploy, deployments, rollback } from './commands/deploy';
import { dev, preview } from './commands/dev';
import { domainsAdd, domainsList, domainsRemove } from './commands/domains';
import {
  mailDomainsAdd,
  mailDomainsList,
  mailDomainsRemove,
  mailDomainsVerify,
  mailSender,
} from './commands/mail';
import { envPull, link, unlink } from './commands/link';
import { envList, envRm, envSet } from './commands/env';
import { logs } from './commands/logs';
import { login, logout } from './commands/login';
import {
  deployTokenCreate,
  deployTokenList,
  deployTokenRevoke,
  tokensList,
  tokensRevoke,
  tokensRotate,
} from './commands/tokens';
import { whoami } from './commands/whoami';

const AYUDA = `hermes ${VERSION} — CLI de Hermes para agencias

Uso: hermes <comando> [opciones]

  create [carpeta]      Crear una tienda nueva desde el starter (= npm create
                        @hermesecommerce/store; mismas opciones: --no-install,
                        --pm <gestor>, --link/--no-link; \`hermes create --help\`)
  login                 Entrar con tu usuario del backoffice (abre el navegador)
      --api <url>       API (default https://api.pow.la)
      --no-browser      No abrir el navegador, sólo mostrar el link
  logout                Cerrar la sesión (revoca el token de la CLI)
  whoami [--json]       Quién sos y a qué marcas tenés acceso
  link                  Linkear esta carpeta a una marca: crea TUS tokens de
                        desarrollo (personales) y los escribe en .env. Usa el
                        proyecto de la marca si ya existe (una tienda, un
                        proyecto: el equipo trabaja con branches y previews)
      --tenant <marca>  Sin elegir de la lista
      --name <nombre>   Forzar un proyecto (si no hay ninguno, default: el del
                        package.json)
      --domain <host>   Dominio del storefront (repetible): return_url del
                        checkout y CORS desde el navegador
      --no-private      Sin token privado (psk_)
      --revalidate-url <url>  Crea el webhook storefront/revalidate
  unlink [--revoke]     Sacar las variables HERMES_* y el link (--revoke: y revocar
                        tus tokens de desarrollo)
  env pull [--rotate] [--environment production|preview]
                        Verificar/actualizar el .env y bajar las variables NO
                        secretas del proyecto (--rotate: tus tokens de
                        desarrollo nuevos). Los secretos nunca se bajan
  env list [--environment production|preview] [--json]
                        Variables de entorno de la tienda (las secretas,
                        enmascaradas)
  env set NOMBRE=valor [--secret] [--environment production|preview]
                        Crear/cambiar una variable (default production). Se
                        aplica en el próximo \`hermes deploy\`
  env rm NOMBRE [--environment production|preview] [--yes]
  tokens [list] [--all] Los tokens de la marca (tuyos, de la tienda, de otros)
  tokens revoke <id>    Revocar un token tuyo
  tokens rotate --runtime [--environment production|preview]
                        Rotar los tokens de la tienda publicada (admin): Hermes
                        re-deploya con los nuevos y revoca los anteriores
  dev                   Levantar la tienda en local (script "dev:next", o
                        "dev" en proyectos viejos) con las HERMES_* del .env,
                        después de verificar link y tokens
      --port <n>        Puerto (default 3000)
      --open            Abrir el navegador cuando esté lista
      --no-check        No verificar los tokens contra la API (sin conexión)
      --yes             Instalar dependencias sin preguntar si faltan
  preview               Build de producción + start local (scripts "build" y
                        "start"), con las mismas verificaciones y opciones
  deploy                Publicar la tienda en el hosting de Hermes (el
                        Cloudflare de Pow): build con @opennextjs/cloudflare,
                        subida y URL. Sin cuenta ni token de Cloudflare
      --preview         Preview de una branch (URL propia, no toca producción)
      --branch <nombre> La branch de la preview (default: la de git)
      --no-build        Subir el último build (.open-next + .hermes/build)
      --yes, --force    No preguntar (herramientas del build, y deployar aunque
                        el deploy activo sea de un commit que no está en tu branch)
                        Con HERMES_DEPLOY_TOKEN (CI) no hace falta login
  deployments [--json]  Historial de deploys del proyecto
  deployments rm [--branch x] [--yes]
                        Borrar la preview de una branch (default: la de git)
  rollback <id> [--yes] Volver a poner en el aire la versión de un deploy
  logs                  Logs de la tienda publicada (pedidos, console.log,
                        errores): en vivo hasta 15 minutos (Ctrl+C para salir)
      --preview [--branch x]  Los de una preview (default: la branch de git)
      --status error|ok       Sólo los pedidos con error (5xx, excepción,
                              console.error) o sólo los que anduvieron
      --search <texto>        Los que contienen ese texto
      --since <30s|15m|1h|2d> Mostrar también los recientes (hasta 7 días)
      --no-follow             Mostrar y salir (sin quedar en vivo)
      --json                  Un evento JSON por línea
  deploy-token create [--environment production|preview]
                        Token para deployar desde CI (HERMES_DEPLOY_TOKEN; admin)
  deploy-token list | revoke <id>
  domains add <dominio> Conectar tu dominio (www.; el checkout va en
                        www.<dominio>/checkout): muestra los registros DNS
      --checkout-subdomain
                        Sumar checkout.<dominio> (front hosteado afuera)
      --wait            Esperar a que Cloudflare lo valide (--timeout <s>, 900)
  domains list [--json] Estado de tus dominios
  domains remove <dominio> [--yes]
  mail-domains add <dominio>
                        Autenticar tu dominio para mandar los mails desde él
                        (DKIM + MAIL FROM): muestra los registros DNS. Sin
                        esto, los mails salen de Pow con el nombre de tu marca
  mail-domains list [--json]
                        Con qué remitente salen hoy y el estado de tus dominios
  mail-domains verify <dominio>
                        Volver a chequear ya los registros en SES
  mail-domains remove <dominio> [--yes]
  mail-sender set <email|pow> [--reply-to <email>] [--name <nombre>]
                        Elegir el remitente (de un dominio tuyo verificado;
                        \`pow\` = la dirección de Pow) y a dónde van las respuestas

Opciones comunes: --api <url>, --env-file <archivo> (default .env), --help
`;

type Comando = (ctx: Ctx, p: Parsed) => Promise<void>;

const COMANDOS: Record<string, Comando> = {
  login,
  logout,
  whoami,
  link,
  unlink,
  'env pull': envPull,
  env: envList,
  'env list': envList,
  'env set': envSet,
  'env rm': envRm,
  logs,
  dev,
  preview,
  deploy,
  deployments,
  rollback,
  'domains add': domainsAdd,
  'domains list': domainsList,
  'domains remove': domainsRemove,
  'mail-domains add': mailDomainsAdd,
  'mail-domains list': mailDomainsList,
  'mail-domains verify': mailDomainsVerify,
  'mail-domains remove': mailDomainsRemove,
  'mail-sender': mailSender,
  tokens: tokensList,
  'tokens list': tokensList,
  'tokens revoke': tokensRevoke,
  'tokens rotate': tokensRotate,
  'deploy-token create': deployTokenCreate,
  'deploy-token list': deployTokenList,
  'deploy-token revoke': deployTokenRevoke,
};

const BOOLEANOS = [
  'browser',
  'private',
  'yes',
  'revoke',
  'rotate',
  'json',
  'version',
  'open',
  'check',
  'preview',
  'build',
  'wait',
  'checkout',
  'checkout-subdomain',
  'runtime',
  'force',
  'all',
  'secret',
  'follow',
];

/** Corre la CLI y devuelve el código de salida. */
export async function main(argv: string[], ctx: Ctx): Promise<number> {
  try {
    // create le pasa todo (también --help) al generador, sin parsear.
    if (argv[0] === 'create') return await create(ctx, argv.slice(1));
    const parsed = parseArgs(argv, BOOLEANOS, ['domain']);
    const [a, b] = parsed.positional;
    if (parsed.flags.version || a === 'version') {
      ctx.out(VERSION);
      return 0;
    }
    if (!a || a === 'help' || parsed.flags.help) {
      ctx.out(AYUDA);
      return 0;
    }
    const nombre = ['env', 'domains', 'mail-domains', 'tokens', 'deploy-token'].includes(a) ? `${a} ${b ?? ''}`.trim() : a;
    const cmd = COMANDOS[nombre];
    if (!cmd) {
      ctx.err(`Comando desconocido: ${nombre}\n`);
      ctx.err(AYUDA);
      return 2;
    }
    await cmd(ctx, parsed);
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      if (e.code === 0) {
        ctx.out(e.message);
        return 0;
      }
      const pre = e instanceof ApiError ? `Error (${e.status})` : 'Error';
      ctx.err(`✘ ${pre}: ${e.message}`);
      return e.code;
    }
    ctx.err(`✘ Error inesperado: ${(e as Error)?.stack ?? String(e)}`);
    return 1;
  }
}
