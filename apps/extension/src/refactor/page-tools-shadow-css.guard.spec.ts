/**
 * 说明：Page tools Shadow CSS 与 Tailwind 配置 guard。
 *
 * 职责：
 * - 确认 page-facing UI 只从 `page-tools.shadow.css?inline` 注入样式；
 * - 禁止旧 `page-tools-styles.ts` 字符串样式入口复活；
 * - 确认 Tailwind 只保留 Node 可直接加载的 MJS 配置，并且 page tools token 已进入配置真源。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

/** 读取仓库内文件。 */
function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('page tools shadow css guard', () => {
  it('injects page tools styles from inline Shadow CSS asset', () => {
    const rootText = readRepoFile('src/extension/content-script/page-tools/page-tools-root.tsx');
    const cssPath = path.join(SRC_ROOT, 'extension/content-script/page-tools/page-tools.shadow.css');

    expect(fs.existsSync(cssPath)).toBe(true);
    expect(fs.existsSync(path.join(SRC_ROOT, 'extension/content-script/page-tools/page-tools-styles.ts'))).toBe(false);
    expect(rootText).toContain("import pageToolsShadowCss from './page-tools.shadow.css?inline'");
    expect(rootText).toContain('PAGE_TOOLTIP_STYLES');
    expect(rootText).not.toContain('PAGE_TOOLS_STYLES');
  });

  it('keeps page-facing Shadow CSS isolated and free of native title hints', () => {
    const cssText = readRepoFile('src/extension/content-script/page-tools/page-tools.shadow.css');

    expect(cssText).toContain(':host');
    expect(cssText).toContain('.page-tools-root');
    expect(cssText).toContain('--olyq-page-tools-host-z');
    expect(cssText).not.toContain('title=');
    expect(cssText).not.toContain('[title]');
  });

  it('keeps Tailwind on the MJS config with page tools semantic tokens', () => {
    const tailwindMjsPath = path.join(REPO_ROOT, 'tailwind.config.mjs');
    const tailwindTsPath = path.join(REPO_ROOT, 'tailwind.config.ts');
    const tailwindJsPath = path.join(REPO_ROOT, 'tailwind.config.js');
    const tailwindText = readRepoFile('tailwind.config.mjs');
    const componentsJsonText = readRepoFile('components.json');

    expect(fs.existsSync(tailwindMjsPath)).toBe(true);
    expect(fs.existsSync(tailwindTsPath)).toBe(false);
    expect(fs.existsSync(tailwindJsPath)).toBe(false);
    expect(tailwindText).toContain('page-tools-tokens.json');
    expect(tailwindText).toContain('PAGE_TOOLS_TAILWIND_TOKENS');
    expect(tailwindText).toContain('pageTools: PAGE_TOOLS_TAILWIND_TOKENS.colors');
    expect(componentsJsonText).toContain('"config": "tailwind.config.mjs"');
  });
});
