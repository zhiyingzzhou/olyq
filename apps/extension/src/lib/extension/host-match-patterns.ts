/**
 * 说明：Host match pattern 纯字符串工具。
 *
 * 职责：
 * - 统一把 URL、Provider base URL 和用户填写的远端地址归一成 Chrome match pattern；
 * - 暴露安装期普通网页 host pattern 真源，供 manifest invariant、状态页和诊断展示复用；
 * - 只做本地字符串解析，不申请、不撤销、不检查运行时网页权限。
 *
 * 边界：
 * - `host_permissions` 是 manifest 字段名，运行时逻辑不得把它重新解释为用户授权流程；
 * - 本模块返回的细粒度 pattern 只用于网络目标诊断、设置页预览和错误定位素材。
 */

/** Chrome / Firefox 扩展 manifest 使用的 host match pattern。 */
export type HostMatchPattern = `${string}://${string}/*` | '<all_urls>';

/** 安装期普通网页 host_permissions 的唯一真源。 */
export const INSTALL_TIME_WEB_HOST_PATTERNS = ['http://*/*', 'https://*/*'] as const;
/** 真实网页注入面仍只落到普通 web 页面。 */
export const INSTALL_TIME_WEB_MATCH_PATTERNS = ['http://*/*', 'https://*/*'] as const;
/** 在错误或诊断面板中展示的安装期普通网页 host pattern 标签。 */
export const INSTALL_TIME_WEB_HOST_PATTERN_LABEL = INSTALL_TIME_WEB_HOST_PATTERNS.join(', ');

/** 对字符串列表做去空白、去重处理。 */
function uniqueStrings(items: ReadonlyArray<string>) {
  return Array.from(new Set(items.map((x) => String(x || '').trim()).filter(Boolean)));
}

/** 判断给定 match patterns 是否完整覆盖安装期普通网页。 */
export function hasInstallTimeWebHostPatterns(patterns: ReadonlyArray<string>): boolean {
  const normalized = uniqueStrings(patterns);
  return normalized.includes('<all_urls>')
    || INSTALL_TIME_WEB_HOST_PATTERNS.every((pattern) => normalized.includes(pattern));
}

/** 判断给定 match patterns 是否命中任意一个安装期普通网页模式。 */
export function hasAnyInstallTimeWebHostPattern(patterns: ReadonlyArray<string>): boolean {
  const normalized = uniqueStrings(patterns);
  return normalized.includes('<all_urls>')
    || INSTALL_TIME_WEB_HOST_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * 将任意 URL 转成 host match pattern（仅支持 http/https）。
 *
 * 示例：
 * - https://example.com/a/b → https://example.com/*
 * - http://localhost:11434/v1 → http://localhost:11434/*
 */
export function toHostMatchPatternFromUrl(url: string): HostMatchPattern | null {
  const raw = String(url || '').trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}/*` as HostMatchPattern;
  } catch {
    return null;
  }
}

/**
 * 将 Provider 的 apiHost/baseURL 转成 host match pattern。
 *
 * 说明：
 * - apiHost 可能带路径段（如 /v1、/api/paas/v4），这里统一只取 origin；
 * - 若包含占位符（例如 Azure/Bedrock 默认的 `{region}` / `{deployment}`），视为“未配置完成”，返回 null。
 */
export function toHostMatchPatternFromApiHost(apiHost: string): HostMatchPattern | null {
  const raw = String(apiHost || '').trim();
  if (!raw) return null;
  if (raw.includes('{') || raw.includes('}')) return null;
  return toHostMatchPatternFromUrl(raw);
}

/** 从 match pattern 取可展示的 origin（例如 https://api.openai.com）。 */
export function toDisplayOriginFromMatchPattern(pattern: string): string {
  const s = String(pattern || '').trim();
  if (!s) return '';
  const idx = s.indexOf('/*');
  if (idx > 0) return s.slice(0, idx);
  return s;
}
