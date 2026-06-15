/**
 * 说明：`vite-config.spec` 源码模块。
 *
 * 职责：
 * - 约束浏览器扩展构建配置里的关键安全/运行时开关；
 * - 防止后续改动把 page-facing content script 又带回网页 origin 解析的 preload 链路。
 *
 * 边界：
 * - 本文件只校验 Vite 配置事实，不承担运行时代码行为验证。
 */
// @vitest-environment node

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viteConfigModuleUrl = pathToFileURL(path.resolve(__dirname, '../../vite.config.mjs')).href;
const contentScriptOutputModuleUrl = pathToFileURL(path.resolve(__dirname, '../../scripts/extension-content-script-output.mjs')).href;
const originalTarget = process.env.OLYQ_TARGET;

/**
 * 动态加载当前浏览器扩展的 Vite 配置。
 *
 * 说明：
 * - 直接复用仓库根配置文件，避免在测试里复制第二份 build 约束；
 * - 每次追加时间戳，确保命中最新模块而不是 Node import cache。
 */
async function loadViteConfigForTarget(target: 'chromium' | 'firefox') {
  process.env.OLYQ_TARGET = target;
  const mod = await import(`${viteConfigModuleUrl}?target=${target}&ts=${Date.now()}-${Math.random()}`);
  const configFactory = mod.default as (env: { mode: string }) => Record<string, unknown>;
  return configFactory({ mode: 'production' });
}

/**
 * 读取 content script 输出命名真源。
 *
 * 说明：测试直接断言 Vite 配置使用同一组 helper，避免构建配置和产物
 * invariant 脚本之间各自复制 canonical 文件名。
 */
async function loadContentScriptOutputHelpers() {
  const mod = await import(`${contentScriptOutputModuleUrl}?ts=${Date.now()}-${Math.random()}`);
  return mod as {
    CONTENT_SCRIPT_OUTPUT_FILES: {
      loader: string;
      main: string;
    };
  };
}

afterEach(() => {
  if (originalTarget === undefined) delete process.env.OLYQ_TARGET;
  else process.env.OLYQ_TARGET = originalTarget;
});

describe('vite.config 内容脚本构建约束', () => {
  test.each(['chromium', 'firefox'] as const)('%s 构建都禁用 modulepreload 注入', async (target) => {
    const config = await loadViteConfigForTarget(target);
    const build = config.build as { modulePreload?: unknown } | undefined;

    expect(build?.modulePreload).toBe(false);
  });

  test.each(['chromium', 'firefox'] as const)('%s 构建不再产出 popup / options 入口，并保留 panel + offscreen', async (target) => {
    const config = await loadViteConfigForTarget(target);
    const build = config.build as {
      rollupOptions?: {
        input?: Record<string, string>;
      };
    } | undefined;

    expect(Object.keys(build?.rollupOptions?.input ?? {})).toEqual(expect.arrayContaining(['panel', 'offscreen']));
    expect(build?.rollupOptions?.input).not.toHaveProperty('popup');
    expect(build?.rollupOptions?.input).not.toHaveProperty('options');
  });

  test.each(['chromium', 'firefox'] as const)('%s 构建固定 page-facing content script 产物名', async (target) => {
    const [config, { CONTENT_SCRIPT_OUTPUT_FILES }] = await Promise.all([
      loadViteConfigForTarget(target),
      loadContentScriptOutputHelpers(),
    ]);
    const build = config.build as {
      rollupOptions?: {
        output?: {
          entryFileNames?: (chunkInfo: { name?: string; facadeModuleId?: string | null; moduleIds?: string[] }) => string;
          chunkFileNames?: (chunkInfo: { name?: string; moduleIds?: string[] }) => string;
          assetFileNames?: (assetInfo: { name?: string }) => string;
        };
      };
    } | undefined;
    const output = build?.rollupOptions?.output;

    expect(output?.entryFileNames?.({
      facadeModuleId: path.resolve(__dirname, 'content-script/index.ts'),
    })).toBe(CONTENT_SCRIPT_OUTPUT_FILES.main);
    expect(output?.entryFileNames?.({
      name: 'index.ts',
      facadeModuleId: null,
    })).toBe(CONTENT_SCRIPT_OUTPUT_FILES.main);
    expect(output?.entryFileNames?.({
      name: 'crx-content-script',
      facadeModuleId: null,
      moduleIds: [path.resolve(__dirname, 'content-script/index.ts')],
    })).toBe(CONTENT_SCRIPT_OUTPUT_FILES.main);
    expect(output?.chunkFileNames?.({
      name: 'index.ts',
      moduleIds: [path.resolve(__dirname, 'content-script/index.ts')],
    })).toBe(CONTENT_SCRIPT_OUTPUT_FILES.main);
    expect(output?.assetFileNames?.({ name: 'index.ts-loader.js' })).toBe(CONTENT_SCRIPT_OUTPUT_FILES.loader);

    expect(output?.entryFileNames?.({
      facadeModuleId: path.resolve(__dirname, 'sidepanel/main.tsx'),
    })).toBe('assets/[name]-[hash].js');
    expect(output?.chunkFileNames?.({ moduleIds: [path.resolve(__dirname, 'sidepanel/SidePanelApp.tsx')] })).toBe('assets/[name]-[hash].js');
    expect(output?.assetFileNames?.({ name: 'style.css' })).toBe('assets/[name]-[hash][extname]');
  });
});
