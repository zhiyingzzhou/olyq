/**
 * technology-stack smoke 用例真源。
 *
 * 说明：
 * - 这里用可重复的公开信号 fixture 覆盖真实站点常见技术组合；
 * - 不访问真实网站，避免外部网络、登录态和第三方反爬导致默认回归不稳定；
 * - 每个用例只验证页面或网络中已经公开暴露的信号，不模拟私有服务端实现。
 */
import { detectTechnologyStackWithRules } from '../src/lib/technology-stack/detector';
import type {
  TechnologyDetectionSignals,
  TechnologyRule,
  TechnologyStackSmokeCaseResult,
} from '../src/lib/technology-stack/types';

interface TechnologyStackSmokeCase {
  /** 用例 ID。 */
  id: string;
  /** 用例说明。 */
  title: string;
  /** 代表性公开 URL。 */
  url: string;
  /** 探测输入。 */
  signals: TechnologyDetectionSignals;
  /** 期望命中的技术 slug。 */
  expectedSlugs: string[];
  /** 不应该命中的技术 slug。 */
  blockedSlugs?: string[];
}

/**
 * 构造基础公开信号。
 *
 * @param id - 用例 ID。
 * @param url - 页面 URL。
 * @returns 可继续合并的探测信号。
 */
function createSignals(id: string, url: string): TechnologyDetectionSignals {
  return {
    page: {
      title: id,
      url,
      extractedAt: Date.now(),
      pageFingerprint: `smoke-${id}`,
      language: 'en-US',
      meta: {},
      scriptSrc: [],
      inlineScript: [],
      stylesheetHrefs: [],
      cssText: [],
      dom: {},
      text: '',
      html: '<html><head></head><body></body></html>',
      js: {},
      scanCoverage: 'complete',
    },
    network: {
      headers: {},
      cookieNames: [],
      requestUrls: [],
      updatedAt: Date.now(),
    },
  };
}

/**
 * 以稳定方式合并 smoke 信号。
 *
 * @param base - 基础信号。
 * @param patch - 信号补丁。
 * @returns 合并后的信号。
 */
function withSignals(
  base: TechnologyDetectionSignals,
  patch: Partial<TechnologyDetectionSignals['page']> & {
    headers?: Record<string, string>;
    cookieNames?: string[];
    requestUrls?: string[];
  },
): TechnologyDetectionSignals {
  return {
    page: {
      ...base.page,
      ...patch,
      meta: { ...base.page.meta, ...(patch.meta ?? {}) },
      scriptSrc: [...base.page.scriptSrc, ...(patch.scriptSrc ?? [])],
      inlineScript: [...base.page.inlineScript, ...(patch.inlineScript ?? [])],
      stylesheetHrefs: [...base.page.stylesheetHrefs, ...(patch.stylesheetHrefs ?? [])],
      cssText: [...base.page.cssText, ...(patch.cssText ?? [])],
      dom: { ...base.page.dom, ...(patch.dom ?? {}) },
      js: { ...base.page.js, ...(patch.js ?? {}) },
    },
    network: {
      ...base.network,
      headers: { ...base.network.headers, ...(patch.headers ?? {}) },
      cookieNames: [...base.network.cookieNames, ...(patch.cookieNames ?? [])],
      requestUrls: [...base.network.requestUrls, ...(patch.requestUrls ?? [])],
    },
  };
}

/** 可重复执行的技术栈 smoke 矩阵。 */
export const TECHNOLOGY_STACK_SMOKE_CASES: TechnologyStackSmokeCase[] = [
  {
    id: 'frameworks-react-next',
    title: 'React and Next.js public page signals',
    url: 'https://nextjs.org/',
    signals: withSignals(createSignals('frameworks-react-next', 'https://nextjs.org/'), {
      html: '<div id="__next" data-reactroot><script id="__NEXT_DATA__">{}</script></div>',
      scriptSrc: ['https://nextjs.org/_next/static/chunks/main.js', 'https://cdn.example.com/react.production.min.js'],
      dom: { '#__next': true, 'script#__NEXT_DATA__': true, '[data-reactroot]': true },
      js: { React: true, __NEXT_DATA__: true },
      headers: { 'x-nextjs-cache': 'HIT' },
    }),
    expectedSlugs: ['react', 'next-js'],
  },
  {
    id: 'frameworks-vue-nuxt',
    title: 'Vue and Nuxt public page signals',
    url: 'https://nuxt.com/',
    signals: withSignals(createSignals('frameworks-vue-nuxt', 'https://nuxt.com/'), {
      html: '<div id="__nuxt" data-v-app></div><script>window.__NUXT__={}</script>',
      scriptSrc: ['https://cdn.example.com/_nuxt/app.js', 'https://cdn.example.com/vue.global.prod.js'],
      dom: { '#__nuxt': true, '[data-v-app]': true },
      js: { Vue: true, __NUXT__: true },
    }),
    expectedSlugs: ['vue-js', 'nuxt-js'],
  },
  {
    id: 'frameworks-angular-svelte',
    title: 'Angular, Svelte and SvelteKit public page signals',
    url: 'https://example.dev/app',
    signals: withSignals(createSignals('frameworks-angular-svelte', 'https://example.dev/app'), {
      html: '<app-root ng-version="17.0.0"></app-root><div class="svelte-abc" data-sveltekit></div>',
      meta: { generator: 'SvelteKit' },
      scriptSrc: ['https://cdn.example.com/_app/immutable/start.js', 'https://cdn.example.com/svelte/app.js'],
      dom: {
        '[ng-version]': true,
        '[ng-version]::attr::ng-version': '17.0.0',
        'app-root': true,
        "link[href*='/svelte/'], main[class^='svelte-'], a[data-svelte-h^='svelte-'], nav[data-svelte-h^='svelte-'], section[data-svelte-h^='svelte-'], div[class*='svelte-']": true,
        '#svelte-announcer': true,
      },
      js: { getAllAngularRootElements: true, __svelte: true },
    }),
    expectedSlugs: ['angular', 'svelte', 'sveltekit'],
  },
  {
    id: 'cms-commerce-foundation',
    title: 'WordPress, WooCommerce and Shopify public signals',
    url: 'https://store.example.com/',
    signals: withSignals(createSignals('cms-commerce-foundation', 'https://store.example.com/'), {
      meta: { generator: 'WordPress 6.5' },
      html: '<link href="/wp-json/"><div class="woocommerce wc-cart-fragments">Shopify.theme</div>',
      scriptSrc: ['https://store.example.com/wp-content/plugins/woocommerce/cart.js', 'https://cdn.shopify.com/theme.js'],
      cookieNames: ['woocommerce_cart_hash', 'wp_woocommerce_session_test', '_shopify_y', 'cart_currency'],
      requestUrls: ['https://store.example.com/wp-json/wc/store/cart'],
      js: { Shopify: true },
    }),
    expectedSlugs: ['wordpress', 'woocommerce', 'shopify'],
  },
  {
    id: 'site-builders',
    title: 'Webflow, Wix and Squarespace public signals',
    url: 'https://builder.example.com/',
    signals: withSignals(createSignals('site-builders', 'https://builder.example.com/'), {
      meta: { generator: 'Webflow' },
      html: '<div data-wf-page="a" data-wf-site="b"></div><script src="https://static.wixstatic.com/app.js"></script>',
      scriptSrc: ['https://assets.website-files.com/webflow.js', 'https://static.wixstatic.com/site.js', 'https://static.squarespace.com/universal/scripts-compressed.js'],
      dom: { '[data-wf-page]': true, '[data-wf-site]': true },
      headers: { 'x-wix-request-id': 'test', server: 'Squarespace' },
    }),
    expectedSlugs: ['webflow', 'wix', 'squarespace'],
  },
  {
    id: 'edge-hosting-servers',
    title: 'Cloudflare, Nginx, Apache, Vercel and Netlify public signals',
    url: 'https://edge.example.com/',
    signals: withSignals(createSignals('edge-hosting-servers', 'https://edge.example.com/'), {
      headers: {
        server: 'cloudflare, nginx/1.25.3, Apache/2.4',
        via: '1.1 example.cloudfront.net (CloudFront)',
        'x-amz-cf-id': 'smoke',
        'cf-ray': 'smoke',
        'x-vercel-id': 'iad1::smoke',
        'x-nf-request-id': 'smoke',
      },
      scriptSrc: ['https://edge.example.com/_vercel/insights/script.js', 'https://app.netlify.com/netlify-identity-widget.js', 'https://d123.cloudfront.net/app.js'],
    }),
    expectedSlugs: ['cloudflare', 'nginx', 'apache-http-server', 'vercel', 'netlify', 'amazon-cloudfront'],
    blockedSlugs: ['bootstrap', 'shopify'],
  },
  {
    id: 'analytics-marketing',
    title: 'GA, GTM, Meta Pixel, Segment and HubSpot public signals',
    url: 'https://marketing.example.com/',
    signals: withSignals(createSignals('analytics-marketing', 'https://marketing.example.com/'), {
      html: '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST"></iframe></noscript>',
      scriptSrc: [
        'https://www.googletagmanager.com/gtag/js?id=G-TEST',
        'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
        'https://connect.facebook.net/en_US/fbevents.js',
        'https://cdn.segment.com/analytics.js/v1/test/analytics.min.js',
        'https://js.hs-scripts.com/123.js',
      ],
      inlineScript: ['gtag("config", "G-TEST"); window.dataLayer = window.dataLayer || [];'],
      js: { gtag: true, dataLayer: true },
      cookieNames: ['_ga', '_gid', '_gcl_au'],
    }),
    expectedSlugs: ['google-analytics', 'google-tag-manager', 'facebook-pixel', 'segment', 'hubspot'],
    blockedSlugs: ['google-publisher-tag'],
  },
  {
    id: 'payments-support-observability',
    title: 'Stripe, PayPal, Intercom, Zendesk and Sentry public signals',
    url: 'https://saas.example.com/pricing',
    signals: withSignals(createSignals('payments-support-observability', 'https://saas.example.com/pricing'), {
      scriptSrc: [
        'https://js.stripe.com/v3',
        'https://www.paypalobjects.com/api/checkout.js',
        'https://widget.intercom.io/widget/test',
        'https://static.intercomcdn.com/intercom.v1.js',
        'https://static.zdassets.com/ekr/snippet.js',
        'https://browser.sentry-cdn.com/8.0.0/bundle.min.js',
      ],
      js: { Stripe: true, paypal: true, Intercom: true },
    }),
    expectedSlugs: ['stripe', 'paypal', 'intercom', 'zendesk', 'sentry'],
  },
  {
    id: 'fingerprint-core-parity',
    title: 'Core browser-extension fingerprint parity signals',
    url: 'https://parity.example.com/app',
    signals: withSignals(createSignals('fingerprint-core-parity', 'https://parity.example.com/app'), {
      meta: {
        'og:title': 'Parity App',
        'og:image': 'https://parity.example.com/og.png',
      },
      scriptSrc: [
        'https://parity.example.com/_next/static/chunks/main-app.js',
        'https://cdn.example.com/react-16.13.1.production.min.js',
        'https://cdn.example.com/moment.min.js',
        'https://cdn.example.com/hammer.min.js',
        'https://g.alicdn.com/platform/app.js',
      ],
      cssText: [':root { --tw-ring-opacity: 1; --tw-bg-opacity: 1; }'],
      dom: {
        '#__next': true,
        'script#__NEXT_DATA__': true,
        'body > div::prop::_reactRootContainer': true,
        "link[rel='manifest']": true,
        "link[href*='.algolia.net'][rel='preconnect']": true,
        "link[type*='application']::attr::type": 'application/rss+xml',
        "meta[property*='og:']": true,
        "div[class*='ant-collapse'], link[href*='antd'], div[class*='ant-spin-container']": true,
        'div[data-base-ui-focusable]': true,
        'body [class]::class': 'flex min-h-screen bg-slate-950 text-white',
      },
      js: {
        __NEXT_DATA__: true,
        'next.version': '16.1.6',
        'React.version': '16.13.1',
        React: true,
        'docsearch.version': '3.9.0',
        moment: true,
        'moment.version': '2.24.0',
        Hammer: true,
        'Hammer.VERSION': '2.0.7',
        MotionIsMounted: true,
        _ethers: true,
        '__core-js_shared__': true,
        '__core-js_shared__.versions.0.version': '2.6.12',
        '__ANTD_STYLE_CACHE_MANAGER_FOR_SSR__': true,
      },
      headers: {
        server: 'cloudflare, Vercel',
        'cf-ray': 'parity',
        'x-vercel-id': 'iad1::parity',
      },
    }),
    expectedSlugs: [
      'algolia-docsearch',
      'cloudflare',
      'react',
      'next-js',
      'rss',
      'moment-js',
      'hammer-js',
      'framer-motion',
      'ethers',
      'core-js',
      'ant-design',
      'pwa',
      'open-graph',
      'vercel',
      'tailwind-css',
      'alibaba-cloud-cdn',
      'base-ui',
    ],
  },
  {
    id: 'strong-csp-static-negative',
    title: 'Strong CSP static page without public technology signals',
    url: 'https://static.example.com/',
    signals: withSignals(createSignals('strong-csp-static-negative', 'https://static.example.com/'), {
      html: '<html><head><meta http-equiv="content-security-policy" content="default-src self"></head><body>Hello</body></html>',
      headers: { 'content-security-policy': "default-src 'self'" },
    }),
    expectedSlugs: [],
    blockedSlugs: ['react', 'wordpress', 'facebook-pixel'],
  },
  {
    id: 'bundle-only-negative',
    title: 'Bundle-only SPA with no exposed framework signature',
    url: 'https://bundle.example.com/app',
    signals: withSignals(createSignals('bundle-only-negative', 'https://bundle.example.com/app'), {
      html: '<div id="app"></div>',
      scriptSrc: ['https://bundle.example.com/assets/app.12345678.js'],
    }),
    expectedSlugs: [],
    blockedSlugs: ['react', 'vue-js', 'next-js', 'angular', 'vite'],
  },
];

/**
 * 执行技术栈 smoke 矩阵。
 *
 * @param rules - 当前 active 技术规则。
 * @returns smoke 用例结果。
 */
export function runTechnologyStackSmokeCases(rules: readonly TechnologyRule[]): TechnologyStackSmokeCaseResult[] {
  return TECHNOLOGY_STACK_SMOKE_CASES.map((smokeCase) => {
    const result = detectTechnologyStackWithRules(smokeCase.signals, rules);
    const detectedSlugs = result.technologies.map((technology) => technology.slug);
    const missing = smokeCase.expectedSlugs.filter((slug) => !detectedSlugs.includes(slug));
    const blocked = (smokeCase.blockedSlugs ?? []).filter((slug) => detectedSlugs.includes(slug));
    return {
      id: smokeCase.id,
      title: smokeCase.title,
      url: smokeCase.url,
      expectedSlugs: smokeCase.expectedSlugs,
      blockedSlugs: smokeCase.blockedSlugs ?? [],
      detectedSlugs,
      passed: missing.length < 1 && blocked.length < 1 && result.scanCoverage === 'complete',
      scanCoverage: result.scanCoverage,
    };
  });
}
