// GENERADO por scripts/generate-cache.mjs desde openapi.yaml.
// No editar a mano: `npm run generate`.

/** Segundos de cada perfil de `x-cache-ttl`. */
export const CACHE_TTL_SECONDS = {"short":60,"long":3600} as const;

/**
 * Caché de cada GET del storefront: tags (plantillas `{param}`) y TTL
 * sugerido (`'none'` = no cachear). Clave = operationId de la spec.
 */
export const CACHE_OPERATIONS = {
  Apps_apps: { path: "/api/v2/storefront/apps", tags: ["settings"], ttl: "long" },
  Categories_header: { path: "/api/v2/categories/header", tags: ["header","categories"], ttl: "long" },
  Config_config: { path: "/api/v2/storefront/config", tags: ["settings"], ttl: "long" },
  Home_instagram: { path: "/api/v2/home/instagram", tags: [], ttl: "long" },
  Home_pageBlocks: { path: "/api/v2/home/page_blocks", tags: ["home-page-blocks"], ttl: "short" },
  Items_filters: { path: "/api/storefront/items/filters", tags: ["products","category-{category_name}"], ttl: "short" },
  Items_index: { path: "/api/storefront/items", tags: ["products","category-{category_name}"], ttl: "short" },
  Landings_index: { path: "/api/v2/landings", tags: ["landings"], ttl: "long" },
  Landings_show: { path: "/api/v2/landings/{slug}", tags: ["landings","landing-{slug}"], ttl: "long" },
  Pdp_bySkus: { path: "/api/v2/items", tags: ["products"], ttl: "short" },
  Pdp_changeVariant: { path: "/api/v2/items/{id}/change_variant", tags: ["product"], ttl: "short" },
  Pdp_look: { path: "/api/v2/items/{id}/look", tags: ["product"], ttl: "short" },
  Pdp_related: { path: "/api/v2/items/{id}/related", tags: ["product"], ttl: "short" },
  Pdp_show: { path: "/api/v2/items/{id}", tags: ["product","product-{id}"], ttl: "short" },
  Pdp_updateVariant: { path: "/api/v2/items/{id}/update_variant", tags: ["product"], ttl: "short" },
  Products_category: { path: "/api/v2/products/category/{slug}", tags: ["products","category-{slug}"], ttl: "short" },
  Products_filters: { path: "/api/v2/products/filters", tags: ["products","category-{category_name}"], ttl: "short" },
  Products_index: { path: "/api/v2/products", tags: ["products"], ttl: "short" },
  Resenas_estadoDeBaja: { path: "/api/v2/product_reviews/unsubscribe", tags: [], ttl: "none" },
  Resenas_formulario: { path: "/api/v2/product_reviews/form", tags: [], ttl: "none" },
  Resenas_galeria: { path: "/api/v2/items/{id}/product_reviews/photos", tags: ["product-{id}"], ttl: "short" },
  Resenas_lista: { path: "/api/v2/items/{id}/product_reviews", tags: ["product-{id}"], ttl: "short" },
  Roulette_config: { path: "/api/v2/storefront/roulette", tags: ["settings"], ttl: "long" },
  Search_buscar: { path: "/api/v2/search", tags: ["products"], ttl: "short" },
  Search_config: { path: "/api/v2/search/config", tags: ["search-config","search-featured","settings"], ttl: "long" },
  Search_sugerir: { path: "/api/v2/search/suggest", tags: ["products"], ttl: "short" },
  Settings_announcement: { path: "/api/v2/settings/announcement", tags: ["announcement"], ttl: "long" },
  Settings_cart: { path: "/api/v2/settings/cart", tags: ["settings"], ttl: "long" },
  Settings_errorPage: { path: "/api/v2/settings/error_page", tags: ["settings"], ttl: "long" },
  Settings_favorites: { path: "/api/v2/settings/favorites", tags: ["settings","favorites"], ttl: "long" },
  Settings_footer: { path: "/api/v2/settings/footer", tags: ["footer"], ttl: "long" },
  Settings_headerCountdown: { path: "/api/v2/settings/header_countdown", tags: ["settings"], ttl: "long" },
  Settings_integrations: { path: "/api/v2/settings/integrations", tags: ["settings"], ttl: "long" },
  Settings_placa: { path: "/api/v2/settings/placa", tags: ["settings"], ttl: "long" },
  Settings_plp: { path: "/api/v2/settings/plp", tags: ["settings"], ttl: "long" },
  Settings_popup: { path: "/api/v2/settings/popup", tags: ["settings"], ttl: "long" },
  Settings_searchFeatured: { path: "/api/v2/settings/search_featured", tags: ["settings","search-featured"], ttl: "long" },
  Settings_spotify: { path: "/api/v2/settings/spotify", tags: ["settings"], ttl: "long" },
  Sitemap_index: { path: "/api/storefront/sitemap", tags: ["products","categories","landings"], ttl: "long" },
  SizeAdvisors_sizeAdvisors: { path: "/api/v2/storefront/size-advisors", tags: [], ttl: "long" },
  StaticContents_index: { path: "/api/v2/static_contents", tags: ["static-contents"], ttl: "long" },
  StaticContents_show: { path: "/api/v2/static_contents/{path}", tags: ["static-contents","static-content-{path}"], ttl: "long" },
  Stores_availability: { path: "/api/v2/stores/availability", tags: [], ttl: "none" },
  Stores_index: { path: "/api/v2/stores", tags: [], ttl: "long" },
} as const;
