/**
 * 说明：`page-tool-url-policy` 页面工具 URL 策略模块。
 *
 * 职责：
 * - 统一判断元素选择器、网页截图等 page tools 是否可以作用于目标 tab URL；
 * - 用 URL parser 的 protocol / hostname / origin 进行精确分类，避免字符串前缀或子串判断误伤。
 *
 * 边界：
 * - 本模块只做 URL 语法与页面类别判断，不发起网络请求；
 * - 具体错误文案仍由调用方根据工具类型映射到各自 i18n key。
 */

/** 页面工具目标 URL 分类。 */
export type PageToolUrlCategory =
  | 'ordinary-web-page'
  | 'file-url'
  | 'browser-internal-page'
  | 'extension-page'
  | 'chrome-web-store'
  | 'invalid-url';

/**
 * 判断 URL 是否为 Chrome Web Store 页面。
 *
 * @param url - 已解析的 URL 对象。
 * @returns 命中 Chrome Web Store 时返回 `true`。
 */
function isChromeWebStoreUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  const pathSegments = url.pathname.split('/').filter(Boolean);
  return (
    (url.hostname === 'chrome.google.com' && pathSegments[0] === 'webstore')
    || url.hostname === 'chromewebstore.google.com'
  );
}

/**
 * 分类页面工具目标 URL。
 *
 * @param rawUrl - tab URL，可为空。
 * @returns 页面工具目标分类。
 */
export function classifyPageToolTargetUrl(rawUrl: string | null | undefined): PageToolUrlCategory {
  const value = String(rawUrl || '').trim();
  if (!value) return 'invalid-url';
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return isChromeWebStoreUrl(url) ? 'chrome-web-store' : 'ordinary-web-page';
    }
    if (url.protocol === 'file:') return 'file-url';
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return 'extension-page';
    if (
      url.protocol === 'chrome:'
      || url.protocol === 'edge:'
      || url.protocol === 'about:'
      || url.protocol === 'devtools:'
    ) {
      return 'browser-internal-page';
    }
    return 'invalid-url';
  } catch {
    return 'invalid-url';
  }
}
