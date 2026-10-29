import { Ctx } from './context';
import { CliError } from './errors';

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenDeCli {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user: { email: string; name?: string };
  /** Cuentas que se autorizaron al aprobar (API vieja: no vienen). */
  all_tenants?: boolean;
  tenants?: string[];
}

export interface Me {
  user: { id: number; email: string; name: string };
  is_staff: boolean;
  token: {
    prefix: string;
    client_name: string | null;
    expires_at: string;
    /** Se autorizaron todas las marcas (staff, o sesión previa a las cuentas). */
    all_tenants?: boolean;
    /** Las cuentas autorizadas al aprobar este login (null si son todas). */
    tenants?: string[] | null;
  };
  /** Sólo las cuentas autorizadas en esta sesión (∩ tus accesos de hoy). */
  tenants: Array<{
    tenant: string;
    name: string;
    role: string | null;
    can_link: boolean;
  }>;
}

export interface LinkResult {
  tenant: string;
  api_url: string;
  project_name: string;
  /** El proyecto del hosting (slug). API vieja: no viene. */
  project?: string;
  /** `dev`: tokens personales de desarrollo. API vieja: no viene. */
  purpose?: 'dev';
  /** Se habilitó localhost (CORS) en el token público. */
  localhost?: boolean;
  rotated: boolean;
  revoked_token_ids: number[];
  public_token: { id: number; name: string; token_prefix: string; token: string };
  private_token: {
    id: number;
    name: string;
    token_prefix: string;
    scopes: string[];
    token: string;
  } | null;
  domains: string[];
  revalidate: { webhook_subscription_id: number; url: string; secret: string } | null;
  warnings: string[];
  env: Record<string, string>;
}

/** Un proyecto de la marca (GET /cli/tenants/:t/projects). */
export interface ProyectoDeMarca {
  /** El slug del proyecto (el `project` del hosting y de los tokens). */
  name: string;
  production_url: string | null;
  last_deploy_at: string | null;
  /** Tiene deploys en el hosting: cuenta para `max_projects`. */
  has_hosting: boolean;
}

export interface ProyectosDeMarca {
  projects: ProyectoDeMarca[];
  /** Tope de proyectos en el hosting del plan (null: el plan no tiene hosting). */
  max_projects: number | null;
  hosting_enabled: boolean;
}

/** Un dominio de «Autenticar dominio» de mails (GET /cli/tenants/:t/mail-domains). */
export interface DominioDeMail {
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  source: 'admin' | 'cli' | 'alta';
  mail_from_domain: string | null;
  last_error: string | null;
  dns_records: Array<{
    type: string;
    name: string;
    value: string;
    priority: number | null;
    purpose: string;
    status: 'verified' | 'pending' | 'failed';
  }>;
  suggested_records: Array<{
    type: string;
    name: string;
    value: string;
    status: 'present' | 'missing' | 'unknown';
  }>;
}

/** Con qué remitente salen hoy los mails de la marca. */
export interface RemitenteDeMail {
  from_name: string | null;
  from_address: string | null;
  reply_to: string | null;
  default_from_address: string;
  effective: { via: 'plataforma' | 'ses_marca' | 'smtp_marca'; from: string; reply_to: string | null };
  managed_by_pow: boolean;
  fallback_reason: string | null;
}

export interface TokenListado {
  id: number;
  name: string;
  token_prefix: string;
  kind?: 'public' | 'private';
  scopes?: string[];
  /** El email sólo en los propios; en los demás, "otra agencia/POW". */
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  /** Lo creó tu cuenta desde la CLI. */
  own?: boolean;
  /** Lo podés revocar/rotar desde la CLI (propio y vigente). */
  revocable?: boolean;
  /** runtime (la tienda publicada), dev (personal) o null. */
  purpose?: 'runtime' | 'dev' | null;
  project?: string | null;
  environment?: string | null;
}

/** Un token de deploy para CI (`hdt_`). */
export interface DeployToken {
  id: number;
  project: string;
  environment: 'production' | 'preview' | null;
  token_prefix: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** De git, lo que se manda con el deploy. */
export interface GitDelDeploy {
  commit: string | null;
  branch: string | null;
  dirty: boolean | null;
}

/** Lo que manda `hermes deploy` al crear el deploy (sin el código). */
export interface PedidoDeDeploy {
  project: string;
  environment: 'production' | 'preview';
  branch?: string;
  worker: {
    main_module: string;
    compatibility_date: string;
    compatibility_flags: string[];
    modules: Array<{ name: string; type: string; size: number; sha256: string }>;
  };
  assets: {
    manifest: Record<string, { hash: string; size: number }>;
    config?: Record<string, unknown>;
  };
  git?: GitDelDeploy;
  /** `revalidate_path`: la ruta del webhook de revalidación en la tienda. */
  hermes?: { revalidate_path?: string };
}

export interface Deployment {
  id: number;
  project: string;
  environment: 'production' | 'preview';
  branch: string | null;
  script: string;
  url: string;
  status: 'uploading' | 'active' | 'superseded' | 'failed' | 'deleted';
  version_id: string | null;
  error: string | null;
  rollback_of: number | null;
  /** API vieja: no vienen. */
  git_commit?: string | null;
  git_branch?: string | null;
  git_dirty?: boolean | null;
  created_by: string;
  created_at: string;
  activated_at: string | null;
}

export interface ResultadoDeDeploy {
  deployment: Deployment;
  url: string;
  warnings: string[];
}

export interface Dominio {
  hostname: string;
  role: 'storefront' | 'checkout';
  project: string | null;
  source: 'alta' | 'cli';
  status: 'pending' | 'active' | 'error';
  cf_status: string | null;
  ssl_status: string | null;
  routed: boolean;
  /** Estado en palabras («Esperando que cargues el CNAME», …). APIs viejas no lo mandan. */
  status_message?: string;
  /** Lo obligatorio: el CNAME a fallback.hermescdn.app (con validación HTTP, nada más). */
  dns_records: Array<{ type: string; name: string; value: string; purpose: string; status: string }>;
  /**
   * Pre-validación OPCIONAL: el TXT de propiedad, para pasar sin corte un
   * dominio que hoy apunta a otro sitio. APIs viejas no lo mandan.
   */
  optional_records?: Array<{
    type: string;
    name: string;
    value: string;
    purpose: string;
    status: string;
    description?: string;
  }>;
  /**
   * Opcionales, sólo para un `www.<x>`: el A/AAAA de `<x>` al redirector de
   * Pow, para que `<x>` sin www redirija a `www.<x>`. Las IPs las manda la API
   * (APIs viejas no lo mandan: no se muestra nada).
   */
  apex_records?: Array<{ type: string; name: string; value: string }> | null;
}

/** Un evento de `hermes logs` (GET /cli/tenants/:t/logs), ya filtrado por la API. */
export interface EventoDeLog {
  timestamp: string;
  request_id: string | null;
  /** `request`: el pedido; `log`: un console.* de tu código. */
  type: 'request' | 'log';
  level: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  outcome: string | null;
  message: string | null;
  error: string | null;
  duration_ms: number | null;
  request_headers?: Record<string, string>;
}

export interface Logs {
  project: string;
  environment: 'production' | 'preview';
  branch: string | null;
  from: string;
  to: string;
  events: EventoDeLog[];
  /** Hubo más eventos de los que entran en un pedido. */
  truncated: boolean;
}

/** Una variable de entorno del proyecto (`hermes env`). Las secretas, sin valor. */
export interface VariableDeEntorno {
  name: string;
  environment: 'production' | 'preview';
  is_secret: boolean;
  /** null si es secreta (nunca vuelve en claro). */
  value: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/** Lo que da `POST …/build-env`. `vars`/`secret_names`: API vieja, no vienen. */
export interface EntornoDeBuild {
  env: Record<string, string>;
  /** Las variables NO secretas del proyecto (`hermes env`), para el build. */
  vars?: Record<string, string>;
  /** Sólo los nombres de las secretas: se sacan del entorno del build. */
  secret_names?: string[];
}

/** Código de la API: el plan de la marca no incluye el hosting. */
export const HOSTING_NO_HABILITADO = 'hosting_no_habilitado';

/** Respuesta no-2xx de la API, con su body. */
export class ApiError extends CliError {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(mensajeDe(status, body));
  }
}

/**
 * ¿Es el 404 de una ruta que la API todavía no tiene (una API vieja)? Nest
 * responde `{"message": "Cannot GET …", "error": "Not Found"}`.
 */
export function esRutaInexistente(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 404 || e.status === 405) &&
    typeof e.body.message === 'string' &&
    /^Cannot (GET|PUT|POST|DELETE)/.test(e.body.message)
  );
}

/** Código de la API: la marca no se autorizó al aprobar este `hermes login`. */
export const CUENTA_NO_AUTORIZADA = 'cuenta_no_autorizada';

function mensajeDe(status: number, body: Record<string, unknown>): string {
  if (body.error === HOSTING_NO_HABILITADO && typeof body.message === 'string')
    return body.message;
  if (body.error === CUENTA_NO_AUTORIZADA)
    return typeof body.message === 'string'
      ? body.message
      : 'Esta sesión de la CLI no tiene acceso a esa marca. Corré `hermes login` y autorizá esa cuenta.';
  if (Array.isArray(body.errors) && body.errors.length)
    return body.errors.map(String).join('\n  · ');
  if (typeof body.error_description === 'string') return body.error_description;
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  return `La API respondió ${status}`;
}

/** Cliente de /api/cli/** (fetch nativo, Node 18+). */
export class HermesApi {
  constructor(
    private readonly ctx: Ctx,
    readonly base: string,
    private readonly token?: string,
  ) {}

  private async pedir<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.ctx.clientName,
    };
    // FormData (multipart): fetch pone el content-type con su boundary.
    const multipart = body instanceof FormData;
    if (body !== undefined && !multipart) headers['content-type'] = 'application/json';
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await this.ctx.fetch(`${this.base}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
        // Sin redirects: un 30x a otro host se llevaría el Bearer (hct_/hdt_) y el cuerpo.
        redirect: 'error',
      });
    } catch (e) {
      throw new CliError(
        `No pude conectarme con ${this.base} (${(e as Error).message}). ¿Estás online? ¿La URL de --api es correcta?`,
      );
    }
    const texto = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      json = { error: texto.slice(0, 200) };
    }
    if (!res.ok) {
      if (res.status === 401 && this.token?.startsWith('hdt_'))
        throw new CliError(
          'HERMES_DEPLOY_TOKEN inválido o revocado: creá otro con `hermes deploy-token create`.',
        );
      if (res.status === 401 && this.token)
        throw new CliError(
          'Tu sesión de la CLI venció o se revocó: corré `hermes login`.',
        );
      throw new ApiError(res.status, json);
    }
    return json as T;
  }

  pedirCodigo(clientName: string) {
    return this.pedir<DeviceCode>('POST', '/cli/device/code', {
      client_name: clientName,
    });
  }

  canjear(deviceCode: string) {
    return this.pedir<TokenDeCli>('POST', '/cli/device/token', {
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  }

  me() {
    return this.pedir<Me>('GET', '/cli/me');
  }

  logout() {
    return this.pedir<{ success: boolean }>('POST', '/cli/logout');
  }

  link(
    tenant: string,
    body: {
      project_name: string;
      domains?: string[];
      private?: boolean;
      revalidate_url?: string;
    },
  ) {
    return this.pedir<LinkResult>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/link`,
      body,
    );
  }

  /**
   * Los proyectos de la marca. null si la API todavía no tiene el endpoint
   * (404 de una API vieja): `hermes link` pregunta el nombre como antes.
   */
  async proyectos(tenant: string): Promise<ProyectosDeMarca | null> {
    try {
      return await this.pedir<ProyectosDeMarca>(
        'GET',
        `/cli/tenants/${encodeURIComponent(tenant)}/projects`,
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
      throw e;
    }
  }

  tokens(tenant: string) {
    return this.pedir<{ storefront_tokens: TokenListado[] }>(
      'GET',
      `/cli/tenants/${encodeURIComponent(tenant)}/tokens`,
    );
  }

  // ------------------------------------------------ hosting (deploy)

  crearDeploy(tenant: string, body: PedidoDeDeploy) {
    return this.pedir<{ deployment: Deployment; upload: { buckets: string[][] } }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/deployments`,
      body,
    );
  }

  subirAssets(tenant: string, id: number, form: FormData) {
    return this.pedir<{ received: number; complete: boolean }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/deployments/${id}/assets`,
      form,
    );
  }

  finalizarDeploy(tenant: string, id: number, form: FormData) {
    return this.pedir<ResultadoDeDeploy>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/deployments/${id}/finalize`,
      form,
    );
  }

  deploys(tenant: string, project?: string, environment?: 'production' | 'preview') {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (environment) params.set('environment', environment);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.pedir<{ deployments: Deployment[] }>(
      'GET',
      `/cli/tenants/${encodeURIComponent(tenant)}/deployments${q}`,
    );
  }

  rollback(tenant: string, id: number) {
    return this.pedir<ResultadoDeDeploy>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/deployments/${id}/rollback`,
    );
  }

  borrarPreview(tenant: string, project: string, branch: string) {
    return this.pedir<{ success: boolean; removed: { script: string; url: string }; warnings: string[] }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/previews?project=${encodeURIComponent(project)}&branch=${encodeURIComponent(branch)}`,
    );
  }

  agregarDominio(tenant: string, body: { hostname: string; project: string; checkout?: boolean }) {
    return this.pedir<{ domains: Dominio[]; warnings: string[] }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/domains`,
      body,
    );
  }

  dominios(tenant: string) {
    return this.pedir<{ domains: Dominio[]; warnings: string[] }>(
      'GET',
      `/cli/tenants/${encodeURIComponent(tenant)}/domains`,
    );
  }

  quitarDominio(tenant: string, hostname: string) {
    return this.pedir<{ success: boolean; removed: string[] }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/domains/${encodeURIComponent(hostname)}`,
    );
  }

  dominiosDeMail(tenant: string) {
    return this.pedir<{
      /** Pow habilitó «Autenticar dominio» para esta marca. API vieja: no viene. */
      available?: boolean;
      ses_enabled: boolean;
      sender: RemitenteDeMail;
      mail_domains: DominioDeMail[];
      warnings: string[];
    }>('GET', `/cli/tenants/${encodeURIComponent(tenant)}/mail-domains`);
  }

  agregarDominioDeMail(tenant: string, domain: string) {
    return this.pedir<{ mail_domain: DominioDeMail; warnings: string[] }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/mail-domains`,
      { domain },
    );
  }

  verificarDominioDeMail(tenant: string, domain: string) {
    return this.pedir<{ mail_domain: DominioDeMail; warnings: string[] }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/mail-domains/${encodeURIComponent(domain)}/verify`,
    );
  }

  quitarDominioDeMail(tenant: string, domain: string) {
    return this.pedir<{ removed: string; sender_reset: boolean; warnings: string[] }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/mail-domains/${encodeURIComponent(domain)}`,
    );
  }

  elegirRemitente(
    tenant: string,
    body: { from_address?: string | null; reply_to?: string | null; from_name?: string | null },
  ) {
    return this.pedir<{ success: boolean; message: string; sender: RemitenteDeMail }>(
      'PUT',
      `/cli/tenants/${encodeURIComponent(tenant)}/mail-sender`,
      body,
    );
  }

  /**
   * Las variables públicas del build: el pst_ de la tienda (runtime) y las
   * NO secretas del proyecto (`hermes env`; de las secretas, sólo el nombre).
   */
  entornoDeBuild(tenant: string, body: { project: string; environment: 'production' | 'preview' }) {
    return this.pedir<EntornoDeBuild>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/build-env`,
      body,
    );
  }

  rotarRuntime(tenant: string, body: { project: string; environment: 'production' | 'preview' }) {
    return this.pedir<{
      success: boolean;
      project: string;
      environment: string;
      public_token_prefix: string;
      redeployed: number[];
      previous_tokens_revoked: boolean;
      warnings: string[];
    }>('POST', `/cli/tenants/${encodeURIComponent(tenant)}/runtime-tokens/rotate`, body);
  }

  crearDeployToken(tenant: string, body: { project: string; environment: 'production' | 'preview' | null }) {
    return this.pedir<{ deploy_token: DeployToken & { token: string } }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/deploy-tokens`,
      body,
    );
  }

  deployTokens(tenant: string) {
    return this.pedir<{ deploy_tokens: DeployToken[] }>(
      'GET',
      `/cli/tenants/${encodeURIComponent(tenant)}/deploy-tokens`,
    );
  }

  revocarDeployToken(tenant: string, id: number) {
    return this.pedir<{ success: boolean }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/deploy-tokens/${id}`,
    );
  }

  // --------------------------------------------- logs y variables

  /** `hermes logs`: los logs de la tienda publicada (la API habla con Cloudflare). */
  logs(
    tenant: string,
    q: {
      project: string;
      environment: 'production' | 'preview';
      branch?: string;
      since?: string;
      status?: string;
      search?: string;
      limit?: number;
    },
  ) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
    return this.pedir<Logs>('GET', `/cli/tenants/${encodeURIComponent(tenant)}/logs?${params.toString()}`);
  }

  variables(tenant: string, project: string, environment?: 'production' | 'preview') {
    const params = new URLSearchParams({ project });
    if (environment) params.set('environment', environment);
    return this.pedir<{
      project: string;
      environment: string | null;
      env: VariableDeEntorno[];
      limits?: { max_vars: number; max_value_bytes: number };
    }>('GET', `/cli/tenants/${encodeURIComponent(tenant)}/env?${params.toString()}`);
  }

  guardarVariable(
    tenant: string,
    body: { project: string; environment: 'production' | 'preview'; name: string; value: string; secret: boolean },
  ) {
    return this.pedir<{ success: boolean; created: boolean; var: VariableDeEntorno; message: string }>(
      'PUT',
      `/cli/tenants/${encodeURIComponent(tenant)}/env`,
      body,
    );
  }

  borrarVariable(tenant: string, name: string, project: string, environment: 'production' | 'preview') {
    const params = new URLSearchParams({ project, environment });
    return this.pedir<{ success: boolean; removed: { name: string; project: string; environment: string } }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/env/${encodeURIComponent(name)}?${params.toString()}`,
    );
  }

  /** `hermes unlink --revoke`: sólo tus tokens de desarrollo del proyecto. */
  revocarDev(tenant: string, projectName: string) {
    return this.pedir<{ success: boolean; revoked_token_ids: number[] }>(
      'POST',
      `/cli/tenants/${encodeURIComponent(tenant)}/dev-tokens/revoke`,
      { project_name: projectName },
    );
  }

  revocar(tenant: string, id: number) {
    return this.pedir<{ success: boolean }>(
      'DELETE',
      `/cli/tenants/${encodeURIComponent(tenant)}/tokens/${id}`,
    );
  }
}
