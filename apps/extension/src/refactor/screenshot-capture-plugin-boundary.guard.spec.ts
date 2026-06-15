/**
 * 说明：`screenshot-capture-plugin-boundary.guard` 网页截图插件边界守卫。
 *
 * 职责：
 * - 防止统一 `page-tools-root` 重新承载截图业务 JSX、图标和样式常量；
 * - 防止截图 content 插件越过 page-facing 边界直接依赖 sidepanel、聊天 UI 或后台运行时代码；
 * - 把“网页截图可拆成独立 page-tool 插件”的架构要求沉成可执行约束。
 *
 * 边界：
 * - 这里只做源码静态扫描，不替代行为测试；
 * - Service Worker 插件仍允许使用后台 page-tool runtime helper，但不能直接依赖聊天 UI。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_TOOLS_ROOT = path.join(SRC_ROOT, 'extension/content-script/page-tools/page-tools-root.tsx');
const SCREENSHOT_PLUGIN_ROOT = path.join(SRC_ROOT, 'plugins/page-tools/screenshot-capture');
const SCREENSHOT_CONTENT_ROOT = path.join(SCREENSHOT_PLUGIN_ROOT, 'content');

/** 读取源码文件内容。 */
function readSource(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf8');
}

/** 递归列出目录下所有源码文件。 */
function listSourceFiles(absoluteDirectory: string): string[] {
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(absolutePath);
    if (!entry.isFile()) return [];
    return /\.(ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe('screenshot capture page-tool plugin boundary', () => {
  it('keeps page-tools-root as a host instead of the screenshot implementation owner', () => {
    const source = readSource(PAGE_TOOLS_ROOT);

    expect(source).toContain('@/plugins/page-tools/screenshot-capture/content/ui');
    expect(source).toContain('<ScreenshotCaptureTools');
    expect(source).not.toContain('function ScreenshotEditor');
    expect(source).not.toContain('function ScreenshotToolOptions');
    expect(source).not.toContain("createLucideIcon('Mosaic'");
    expect(source).not.toContain('SCREENSHOT_ANNOTATION_COLORS');
    expect(source).not.toContain('SCREENSHOT_MARK_SIZE_TIERS');
    expect(source).not.toContain('SCREENSHOT_MOSAIC_SIZE_TIERS');
  });

  it('keeps the page-facing screenshot content plugin decoupled from sidepanel, chat, and background runtimes', () => {
    const forbiddenImports = [
      '@/components/chat',
      '@/pages/',
      '@/hooks/useChatStore',
      '@/extension/background',
      '@/extension/sidepanel',
      '@/plugins/sw',
    ];

    const offenders = listSourceFiles(SCREENSHOT_CONTENT_ROOT)
      .map((absolutePath) => {
        const source = readSource(absolutePath);
        const relativePath = path.relative(SRC_ROOT, absolutePath);
        const hits = forbiddenImports.filter((item) => source.includes(item));
        return hits.length ? `${relativePath}: ${hits.join(', ')}` : null;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });

  it('keeps the screenshot plugin out of chat UI internals', () => {
    const forbiddenImports = [
      '@/components/chat',
      '@/pages/index-page',
      '@/hooks/useChatStore',
    ];

    const offenders = listSourceFiles(SCREENSHOT_PLUGIN_ROOT)
      .map((absolutePath) => {
        const source = readSource(absolutePath);
        const relativePath = path.relative(SRC_ROOT, absolutePath);
        const hits = forbiddenImports.filter((item) => source.includes(item));
        return hits.length ? `${relativePath}: ${hits.join(', ')}` : null;
      })
      .filter((item): item is string => Boolean(item));

    expect(offenders).toEqual([]);
  });
});
