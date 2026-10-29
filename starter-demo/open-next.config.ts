// Config de @opennextjs/cloudflare para `hermes deploy` (hosting de Hermes, en
// el Cloudflare de Pow). No hace falta tocarla ni tener cuenta de Cloudflare.
// Sin caché incremental persistente: los datos de Hermes se cachean con sus
// tags y TTL. Ver https://opennext.js.org/cloudflare
//
// @opennextjs/cloudflare y wrangler no son dependencias del starter: los
// instala `hermes deploy` la primera vez (devDependencies). Hasta entonces el
// typecheck no encuentra el paquete; por eso el ts-nocheck.
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
