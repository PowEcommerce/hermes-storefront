<script setup lang="ts">
// Referencia de la Storefront API con Redoc, servido desde este mismo sitio
// (redoc.standalone.js y openapi.yaml en /api/). Redoc no tiene «try it»: la
// página no manda pedidos a la API ni pide tokens.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';

declare global {
  interface Window {
    Redoc?: { init: (spec: string, options: object, el: HTMLElement, cb?: (e?: unknown) => void) => void };
  }
}

const contenedor = ref<HTMLElement | null>(null);
const estado = ref<'cargando' | 'listo' | 'error'>('cargando');
let script: HTMLScriptElement | null = null;

function cargarRedoc(): Promise<void> {
  if (window.Redoc) return Promise.resolve();
  return new Promise((resolve, reject) => {
    script = document.createElement('script');
    script.src = withBase('/api/redoc.standalone.js');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Redoc'));
    document.head.appendChild(script);
  });
}

const alturaBarra = () => document.querySelector<HTMLElement>('.VPNav')?.offsetHeight ?? 64;

onMounted(async () => {
  try {
    await cargarRedoc();
    if (!contenedor.value || !window.Redoc) return;
    window.Redoc.init(
      withBase('/api/openapi.yaml'),
      {
        scrollYOffset: alturaBarra,
        hideHostname: false,
        expandResponses: '200,201',
        jsonSampleExpandLevel: 2,
        sortTagsAlphabetically: false,
        theme: {
          colors: { primary: { main: '#4f46e5' } },
          typography: {
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            headings: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
            code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          },
          sidebar: { width: '280px' },
        },
      },
      contenedor.value,
      (e) => {
        estado.value = e ? 'error' : 'listo';
      },
    );
  } catch {
    estado.value = 'error';
  }
});

onBeforeUnmount(() => {
  if (contenedor.value) contenedor.value.innerHTML = '';
});
</script>

<template>
  <div class="referencia-api">
    <p class="aviso">
      Referencia generada de
      <a href="https://github.com/PowEcommerce/hermes-storefront/blob/main/packages/storefront/openapi.yaml"
        >packages/storefront/openapi.yaml</a
      >
      (también en <code>GET https://api.pow.la/api/v2/openapi.json</code>). Para empezar, mirá la
      <a :href="withBase('/guias/agencias')">guía para agencias</a>.
    </p>
    <p v-if="estado === 'cargando'" class="cargando">Cargando la referencia…</p>
    <p v-else-if="estado === 'error'" class="cargando">
      No se pudo cargar la referencia. Bajá el
      <a :href="withBase('/api/openapi.yaml')">openapi.yaml</a> y abrilo con tu herramienta.
    </p>
    <div ref="contenedor" />
  </div>
</template>
