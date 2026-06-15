/**
 * 说明：`manifest-branches.spec` 源码模块。
 *
 * 职责：
 * - 承载 `manifest-branches.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
// @vitest-environment node

import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifestModuleUrl = pathToFileURL(path.resolve(__dirname, '../../manifest.config.mjs')).href;
const manifestHelperModuleUrl = pathToFileURL(path.resolve(__dirname, '../../crx-manifest-helpers.mjs')).href;
const originalTarget = process.env.OLYQ_TARGET;
const originalTextEncoder = globalThis.TextEncoder;
const originalTextDecoder = globalThis.TextDecoder;

/**
 * 测试辅助函数：`loadManifestForTarget`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function loadManifestForTarget(target: 'chromium' | 'firefox') {
  process.env.OLYQ_TARGET = target;
  const mod = await import(`${manifestModuleUrl}?target=${target}&ts=${Date.now()}-${Math.random()}`);
  return mod.default as Record<string, unknown>;
}

/**
 * 运行时加载根目录下的构建 helper。
 *
 * 说明：
 * - 该 helper 以 `.mjs` 暴露给 Vite config；
 * - 测试通过动态 import 直接复用同一实现，避免复制一份 manifest 归一化逻辑。
 */
async function loadCrxManifestHelpers() {
  const mod = await import(`${manifestHelperModuleUrl}?ts=${Date.now()}-${Math.random()}`);
  return mod as {
    CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS: string[];
    TECHNOLOGY_STACK_BRIDGE_RESOURCE: string;
    WEB_PAGE_MATCHES: string[];
  };
}

beforeAll(() => {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
});

afterEach(() => {
  if (originalTarget === undefined) delete process.env.OLYQ_TARGET;
  else process.env.OLYQ_TARGET = originalTarget;
});

afterAll(() => {
  globalThis.TextEncoder = originalTextEncoder;
  globalThis.TextDecoder = originalTextDecoder;
});

describe('manifest.config 浏览器分支', () => {
  test('Chromium 构建使用 side_panel 且不输出 Firefox 专属字段', async () => {
    const manifest = await loadManifestForTarget('chromium');

    expect(manifest.action).toEqual({ default_title: '__MSG_appActionTitle__' });
    expect((manifest.action as { default_popup?: unknown }).default_popup).toBeUndefined();
    expect(manifest.side_panel).toEqual({ default_path: 'src/extension/sidepanel/index.html' });
    expect(manifest.commands).toEqual({
      _execute_action: {
        description: '__MSG_commandOpenPanel__',
      },
    });
    expect(manifest.options_ui).toBeUndefined();
    expect(manifest.sidebar_action).toBeUndefined();
    expect(manifest.browser_specific_settings).toBeUndefined();
    expect(manifest.minimum_chrome_version).toBe('114');
    expect(manifest.permissions).toEqual([
      'storage',
      'alarms',
      'sidePanel',
      'activeTab',
      'tabs',
      'scripting',
      'webNavigation',
      'webRequest',
      'cookies',
      'offscreen',
      'identity',
      'system.cpu',
    ]);
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  test('Firefox 构建使用 sidebar_action 且不输出 Chromium 专属字段', async () => {
    const manifest = await loadManifestForTarget('firefox');

    expect(manifest.action).toEqual({ default_title: '__MSG_appActionTitle__' });
    expect((manifest.action as { default_popup?: unknown }).default_popup).toBeUndefined();
    expect(manifest.sidebar_action).toEqual({
      default_title: '__MSG_appActionTitle__',
      default_panel: 'src/extension/sidepanel/index.html',
      open_at_install: false,
    });
    expect(manifest.commands).toEqual({
      _execute_sidebar_action: {
        description: '__MSG_commandOpenPanel__',
      },
    });
    expect(manifest.options_ui).toBeUndefined();
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.minimum_chrome_version).toBeUndefined();
    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: 'olyq@example.com',
        strict_min_version: '109.0',
      },
    });
    expect(manifest.permissions).toEqual([
      'storage',
      'alarms',
      'activeTab',
      'tabs',
      'scripting',
      'webNavigation',
      'webRequest',
      'cookies',
      'identity',
    ]);
    expect(manifest.permissions).not.toContain('sidePanel');
    expect(manifest.permissions).not.toContain('offscreen');
    expect(manifest.permissions).not.toContain('system.cpu');
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  test('静态内容脚本按 frame 注入且最小 WAR 白名单固定只覆盖普通 http/https 页面', async () => {
    const {
      CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS,
      TECHNOLOGY_STACK_BRIDGE_RESOURCE,
      WEB_PAGE_MATCHES,
    } = await loadCrxManifestHelpers();
    const manifest = await loadManifestForTarget('chromium');

    expect(WEB_PAGE_MATCHES).toEqual(['http://*/*', 'https://*/*']);
    expect(CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS).toEqual(['<all_urls>']);
    expect(manifest.content_scripts).toEqual([
      {
        matches: [...WEB_PAGE_MATCHES],
        js: ['src/extension/content-script/index.ts'],
        run_at: 'document_idle',
        all_frames: true,
        match_about_blank: true,
        match_origin_as_fallback: true,
      },
    ]);
    expect(manifest.web_accessible_resources).toEqual([
      {
        matches: [...WEB_PAGE_MATCHES],
        resources: [TECHNOLOGY_STACK_BRIDGE_RESOURCE],
      },
    ]);
  });

  test('Firefox frame 注入不声明 Chromium 专属 match_origin_as_fallback', async () => {
    const { WEB_PAGE_MATCHES } = await loadCrxManifestHelpers();
    const manifest = await loadManifestForTarget('firefox');

    expect(manifest.content_scripts).toEqual([
      {
        matches: [...WEB_PAGE_MATCHES],
        js: ['src/extension/content-script/index.ts'],
        run_at: 'document_idle',
        all_frames: true,
        match_about_blank: true,
      },
    ]);
  });
});
