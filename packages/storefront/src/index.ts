/**
 * @hermesecommerce/storefront — SDK de la Storefront API v2 de Pow/Hermes para
 * storefronts headless.
 */
export { createStorefrontClient, DEFAULT_API_URL } from './client';
export type {
  StorefrontClient,
  StorefrontClientOptions,
  ApiRequestOptions,
  ConCacheTags,
  PbType,
} from './client';
export {
  normalizePageBlocks,
  resolveHref,
  parseSkuCsv,
  collectPageSkus,
  matchSkuRecords,
  skusOfBlock,
  blockSpan,
  isBlockActive,
  decodeAmp,
} from './content';
export type {
  PageBlock,
  PageBlockOf,
  PageBlockType,
  PageSection,
  HomePageBlocks,
  Landing,
  LandingList,
  LandingSummary,
  HomeInstagram,
  StaticPage,
  StaticPageList,
  SkuProduct,
  SkuProducts,
  StorefrontRoutes,
  ResolveHrefOptions,
  ResolvedHref,
  BlockSpan,
  NormalizedBlock,
  NormalizedSection,
  NormalizedPageBlocks,
  NormalizePageBlocksOptions,
} from './content';
export {
  cacheTagsFor,
  cacheInfoFor,
  CACHE_OPERATIONS,
  CACHE_TTL_SECONDS,
} from './cache';
export type {
  CacheAdapter,
  CacheInfo,
  CacheOperation,
  CacheParams,
  CacheTtl,
} from './cache';
export { handleRevalidateWebhook } from './revalidate';
export {
  SEARCH_APP_SLUG,
  SEARCH_EVENTS_ROUTE,
  MAX_SEARCH_EVENTS_PER_BATCH,
  isAppEnabled,
  searchEventsBatch,
  clientIpFrom,
  deviceFromWidth,
  sendSearchEvents,
  trackSearch,
  trackSearchClick,
  trackSearchAddToCart,
  trackSearchPurchase,
  getSearchAttribution,
  createSearchEventsRoute,
} from './search';
export type {
  SearchEvent,
  SearchEventType,
  SearchEventsResult,
  SearchConfig,
  SearchSuggestion,
  SearchOrigin,
  SearchDevice,
  SearchTrackingOptions,
  SearchAttribution,
  ShownProduct,
  CreateSearchEventsRouteOptions,
} from './search';
export { SDK_VERSION, DEFAULT_USER_AGENT } from './version';
export type {
  HandleRevalidateWebhookInput,
  HandleRevalidateWebhookResult,
  RevalidateTag,
} from './revalidate';
export { HermesApiError, HermesConfigError, isHermesApiError } from './errors';
export type { HermesErrorCode } from './errors';
export type { RequestOptions, FetchLike, Auth } from './http';
export { verifyWebhook } from './webhooks';
export type { VerifyWebhookInput, VerifyWebhookResult } from './webhooks';
export * from './types';
