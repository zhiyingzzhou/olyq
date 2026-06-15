/**
 * 说明：`lobe-icon-list` AI 能力模块。
 *
 * 职责：
 * - 承载 `lobe-icon-list` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LobeIconEntry`、`fetchLobeIcons` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * \@lobehub/icons 动态图标列表服务
 *
 * 从 unpkg CDN 的 ?meta 端点获取所有可用图标，
 * 解析出 icon ID 及是否有 color 变体，缓存到 chrome.storage.local。
 */

import { LOBE_ICONS_CACHE_KEY } from './storage-keys';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { I18nError } from '@/lib/i18n/error';
import {
  consumeBackgroundStoragePromise,
  reportBackgroundStorageFailure,
} from '@/lib/storage/background-storage';

/**
 * 单个 Lobe 图标条目的最小元数据。
 *
 * 说明：
 * - 这里只保留图标选择器和静态资源拼接真正需要的字段；
 * - `c` 是紧凑布尔标记，表示该图标是否存在 `-color` 变体。
 */
export interface LobeIconEntry {
  /** 图标稳定 ID，可直接用于拼接静态资源路径与 UI 选择器值。 */
  id: string;
  /** 是否存在 -color 变体 */
  c: boolean;
}

/** CDN meta 端点 */
const META_URL = 'https://unpkg.com/@lobehub/icons-static-webp@latest/dark/?meta';

/** 缓存有效期：7 天 */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/** 内存缓存 */
let memCache: LobeIconEntry[] | null = null;

/** 正在进行的请求（避免重复） */
let inflight: Promise<LobeIconEntry[]> | null = null;

/** 从 chrome.storage.local 读取缓存 */
async function readCache(): Promise<LobeIconEntry[] | null> {
  try {
    const res = await getStorageAdapter().get([LOBE_ICONS_CACHE_KEY]);
    const val = res[LOBE_ICONS_CACHE_KEY];
    if (val && typeof val === 'object' && Array.isArray((val as { icons?: unknown }).icons)) {
      const stored = val as { icons: LobeIconEntry[]; ts: number };
      if (Date.now() - stored.ts < CACHE_TTL && stored.icons.length > 0) {
        return stored.icons;
      }
    }
  } catch { /* storage 不可用 */ }
  return null;
}

/** 将结果写入 chrome.storage.local */
function writeCache(icons: LobeIconEntry[]) {
  try {
    consumeBackgroundStoragePromise(
      getStorageAdapter().set({ [LOBE_ICONS_CACHE_KEY]: { icons, ts: Date.now() } }),
      {
        key: LOBE_ICONS_CACHE_KEY,
        operation: 'set',
        owner: 'lobe-icon-list.writeCache',
      },
    );
  } catch (error) {
    reportBackgroundStorageFailure(error, {
      key: LOBE_ICONS_CACHE_KEY,
      operation: 'set',
      owner: 'lobe-icon-list.writeCache',
    });
  }
}

/** 从 CDN meta 端点解析文件列表 */
function parseIconFiles(files: Array<{ path: string }>): LobeIconEntry[] {
  const baseIds = new Set<string>();
  const colorIds = new Set<string>();

  for (const f of files) {
    const path = f.path || '';
    if (!path.endsWith('.webp')) continue;
    const name = path.replace(/^.*\//, '').replace(/\.webp$/, '');
    if (name.endsWith('-text')) continue;
    if (name.endsWith('-color')) {
      colorIds.add(name.replace(/-color$/, ''));
    } else {
      baseIds.add(name);
    }
  }

  return Array.from(baseIds)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, c: colorIds.has(id) }));
}

/**
 * 获取所有可用的 lobe-icon 列表。
 * 优先级：内存缓存 → chrome.storage 缓存 → CDN 拉取
 */
export async function fetchLobeIcons(force = false): Promise<LobeIconEntry[]> {
  if (!force && memCache) return memCache;
  if (inflight) return inflight;
  inflight = doFetch(force);
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * 真实执行 lobe 图标清单拉取流程。
 *
 * 说明：
 * - 非强制刷新时优先复用 storage 缓存；
 * - 安装期 host access 已覆盖普通 http/https，失败时直接展示真实 fetch 错误。
 */
async function doFetch(force: boolean): Promise<LobeIconEntry[]> {
  if (!force) {
    const cached = await readCache();
    if (cached) {
      memCache = cached;
      return cached;
    }
  }

  const res = await fetch(META_URL);
  if (!res.ok) throw new I18nError('errors.fetchIconListFailedWithStatus', { status: res.status });
  const meta: { files?: Array<{ path: string }> } = await res.json();
  const icons = parseIconFiles(meta.files || []);

  memCache = icons;
  writeCache(icons);
  return icons;
}
