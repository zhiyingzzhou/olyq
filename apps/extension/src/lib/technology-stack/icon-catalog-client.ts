/**
 * 说明：技术栈图标本地 compact catalog client。
 *
 * 职责：
 * - 仅在 UI 运行时加载随扩展打包的 `catalog.compact.json`；
 * - 使用 module 级内存 cache，避免弹层多次打开重复解析 JSON；
 * - 保持失败语义简单：本地 catalog 加载失败时 UI 回到文字占位。
 *
 * 边界：
 * - 本模块只能由 UI 组件导入，Service Worker 不导入它；
 * - 不写入 `chrome.storage`，不读取远程 manifest 或上游 catalog，不做 SVG HEAD/GET 验证；
 * - 真正 SVG 仍由 `<img>` 从 jsDelivr 静态 URL 加载。
 */
import { getExtensionPageUrl } from '@/lib/extension/runtime-api';
import {
  TECHNOLOGY_ICON_CATALOG_ASSET_PATH,
  normalizeTechnologyIconCatalog,
  type TechnologyIconCatalog,
} from './icon-catalog-schema';

export {
  TECHNOLOGY_ICON_CATALOG_ASSET_PATH,
  TECHNOLOGY_ICON_CATALOG_CDN_ROOT,
  normalizeTechnologyIconCatalog,
  normalizeTechnologyIconTuple,
  type TechnologyIconCatalog,
  type TechnologyIconCatalogDescriptor,
  type TechnologyIconCatalogSourceId,
  type TechnologyIconCatalogSources,
  type TechnologyIconCatalogTuple,
} from './icon-catalog-schema';

/** module 级内存 cache；扩展页刷新后会重新读取本地 public asset。 */
let memoryCatalog: TechnologyIconCatalog | null = null;

/** 合并并发 catalog 加载，避免多个 Popover 同时打开时重复请求。 */
let inflightLoad: Promise<TechnologyIconCatalog | null> | null = null;

/** 解析本地扩展资产 URL。 */
function resolveTechnologyIconCatalogUrl(): string {
  const extensionUrl = getExtensionPageUrl(TECHNOLOGY_ICON_CATALOG_ASSET_PATH);
  if (extensionUrl) return extensionUrl;
  if (typeof globalThis.location !== 'undefined') {
    return new URL(`/${TECHNOLOGY_ICON_CATALOG_ASSET_PATH}`, globalThis.location.origin).toString();
  }
  return TECHNOLOGY_ICON_CATALOG_ASSET_PATH;
}

/** 拉取并校验本地 compact catalog。 */
async function fetchLocalCatalog(): Promise<TechnologyIconCatalog> {
  const response = await fetch(resolveTechnologyIconCatalogUrl(), {
    cache: 'force-cache',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`technology icon catalog fetch failed: ${response.status}`);
  }
  const catalog = normalizeTechnologyIconCatalog(await response.json());
  if (!catalog) {
    throw new Error('technology icon catalog schema invalid');
  }
  return catalog;
}

/**
 * 读取当前内存中的图标 catalog。
 *
 * @returns 已加载 catalog；尚未加载时返回 `null`。
 */
export function peekTechnologyIconCatalog(): TechnologyIconCatalog | null {
  return memoryCatalog;
}

/**
 * 加载本地技术栈图标 compact catalog。
 *
 * @returns 可用 catalog；本地资产缺失或 schema 非法时返回 `null`。
 */
export async function loadTechnologyIconCatalog(): Promise<TechnologyIconCatalog | null> {
  if (memoryCatalog) return memoryCatalog;
  if (!inflightLoad) {
    inflightLoad = (async () => {
      try {
        const catalog = await fetchLocalCatalog();
        memoryCatalog = catalog;
        return catalog;
      } catch {
        return null;
      } finally {
        inflightLoad = null;
      }
    })();
  }
  return inflightLoad;
}

/**
 * 测试专用：清空 module 级内存状态。
 *
 * @remarks
 * 生产代码不应调用；导出是为了让单测覆盖本地资产加载失败语义。
 */
export function clearTechnologyIconCatalogMemoryForTest(): void {
  memoryCatalog = null;
  inflightLoad = null;
}
