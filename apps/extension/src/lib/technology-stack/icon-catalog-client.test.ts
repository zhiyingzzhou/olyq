/**
 * 说明：技术栈图标本地 compact catalog client 测试。
 *
 * 职责：
 * - 覆盖扩展本地资产 fetch、schema/path 校验和 module 内存 cache；
 * - 固定 catalog 不写入 `chrome.storage.local`，不读取远程 manifest 或上游 catalog；
 * - 防止未来把 Iconify Search/API、上游 catalog fetch 或 SVG 校验放回运行时路径。
 */
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TECHNOLOGY_ICON_CATALOG_ASSET_PATH,
  normalizeTechnologyIconCatalog,
  normalizeTechnologyIconTuple,
} from './icon-catalog-schema';

const runtime = vi.hoisted(() => ({
  getExtensionPageUrlMock: vi.fn(),
}));

vi.mock('@/lib/extension/runtime-api', () => ({
  getExtensionPageUrl: runtime.getExtensionPageUrlMock,
}));

/** 构造合法 compact catalog。 */
function createCatalog(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-10T00:00:00.000Z',
    sourceRules: {
      path: 'public/data/technology-fingerprints/fingerprint-rules.json',
      snapshotVersion: '6.12.2',
      generatedAt: '2026-05-10T00:00:00.000Z',
      ruleCount: 7098,
      technologyCount: 7193,
      categoryCount: 106,
    },
    iconCount: 1,
    sources: {
      ts: 'gh/glincker/thesvg@v2.3.0/public/icons/',
      si: 'npm/simple-icons@16.18.1/icons/',
      di: 'npm/devicon@2.17.0/icons/',
      mit: 'npm/material-icon-theme@5.34.0/icons/',
      ski: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
      tb: 'npm/@tabler/icons@3.44.0/icons/outline/',
    },
    icons: {
      react: ['di', 'react/react-original.svg'],
    },
    generic: {
      default: ['tb', 'code.svg'],
      analytics: ['tb', 'chart-line.svg'],
      'ui-frameworks': ['tb', 'brush.svg'],
    },
    ...overrides,
  };
}

/** 构造 fetch Response。 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('technology icon catalog client', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    runtime.getExtensionPageUrlMock.mockReset();
    runtime.getExtensionPageUrlMock.mockImplementation((assetPath: string) => `chrome-extension://unit/${assetPath}`);
    const { clearTechnologyIconCatalogMemoryForTest } = await import('./icon-catalog-client');
    clearTechnologyIconCatalogMemoryForTest();
  });

  it('从扩展本地 compact catalog 资产拉取、校验并进入内存 cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(createCatalog()));
    vi.stubGlobal('fetch', fetchMock);
    const { loadTechnologyIconCatalog, peekTechnologyIconCatalog } = await import('./icon-catalog-client');

    const catalog = await loadTechnologyIconCatalog();

    expect(runtime.getExtensionPageUrlMock).toHaveBeenCalledWith(TECHNOLOGY_ICON_CATALOG_ASSET_PATH);
    expect(fetchMock).toHaveBeenCalledWith(`chrome-extension://unit/${TECHNOLOGY_ICON_CATALOG_ASSET_PATH}`, {
      cache: 'force-cache',
      credentials: 'omit',
    });
    expect(catalog?.icons.react).toEqual(['di', 'react/react-original.svg']);
    expect(catalog?.generic.default).toEqual(['tb', 'code.svg']);
    expect(peekTechnologyIconCatalog()).toBe(catalog);
  });

  it('内存 cache 命中时不重复 fetch 本地 JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(createCatalog()));
    vi.stubGlobal('fetch', fetchMock);
    const { loadTechnologyIconCatalog } = await import('./icon-catalog-client');

    await loadTechnologyIconCatalog();
    await loadTechnologyIconCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('拒绝非法 schema、source prefix 或跨目录文件路径', () => {
    expect(normalizeTechnologyIconCatalog(createCatalog({
      sources: {
        ...createCatalog().sources,
        di: 'npm/devicon@latest/icons/',
      },
    }))).toBeNull();

    expect(normalizeTechnologyIconCatalog(createCatalog({
      icons: {
        react: ['di', '../react.svg'],
      },
    }))).toBeNull();

    expect(normalizeTechnologyIconTuple(['tb', 'code.svg'])).toEqual(['tb', 'code.svg']);
    expect(normalizeTechnologyIconTuple(['tb', '../code.svg'])).toBeNull();
  });

  it('接受 light/dark descriptor，并要求 generic 只能使用 Tabler source', () => {
    const catalog = normalizeTechnologyIconCatalog(createCatalog({
      iconCount: 1,
      icons: {
        'next-js': {
          light: ['ski', 'NextJS-Light.svg'],
          dark: ['ski', 'NextJS-Dark.svg'],
        },
      },
    }));

    expect(catalog?.icons['next-js']).toEqual({
      light: ['ski', 'NextJS-Light.svg'],
      dark: ['ski', 'NextJS-Dark.svg'],
    });

    expect(normalizeTechnologyIconCatalog(createCatalog({
      generic: {
        default: ['di', 'react/react-original.svg'],
      },
    }))).toBeNull();
  });

  it('本地 catalog fetch 失败或 schema 非法时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('asset missing');
    }));
    const { loadTechnologyIconCatalog } = await import('./icon-catalog-client');

    await expect(loadTechnologyIconCatalog()).resolves.toBeNull();

    const { clearTechnologyIconCatalogMemoryForTest } = await import('./icon-catalog-client');
    clearTechnologyIconCatalogMemoryForTest();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(createCatalog({ schemaVersion: 999 }))));
    await expect(loadTechnologyIconCatalog()).resolves.toBeNull();
  });
});
