/**
 * 说明：`inline-notice-alignment.guard` 源码模块。
 *
 * 职责：
 * - 固化图标与提示文案的统一 `InlineNotice` 契约；
 * - 防止 warning / info / error / loading 状态图标重新使用 `mt-0.5` 微调；
 * - 防止旧 `Alert` 恢复 shadcn 式绝对定位图标 hack。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 真实视觉效果由组件测试和关键弹窗交互测试覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * 读取仓库内文件文本。
 *
 * @param relativePath - 相对 `olyq/` 根目录的文件路径。
 * @returns 文件 UTF-8 文本。
 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * 递归列出目录下的 React 源码文件。
 *
 * @param relativeDir - 相对 `olyq/` 根目录的目录路径。
 * @returns 匹配到的源码文件路径。
 */
function listReactSourceFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(REPO_ROOT, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const childRelativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return listReactSourceFiles(childRelativePath);
    if (!entry.isFile()) return [];
    if (!/\.(tsx|ts)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(tsx|ts)$/.test(entry.name)) return [];
    return [childRelativePath];
  });
}

describe('inline notice alignment guard', () => {
  it('Alert 基础组件不再承载绝对定位图标和文字负向位移', () => {
    const alertText = readRepoFile('src/components/ui/alert.tsx');

    expect(alertText).not.toContain('[&>svg');
    expect(alertText).not.toContain('translate-y-[-3px]');
    expect(alertText).toContain('"relative w-full rounded-lg border p-4"');
  });

  it('状态提示图标不再使用 mt-0.5 微调垂直位置', () => {
    const files = [
      ...listReactSourceFiles('src/components'),
      ...listReactSourceFiles('src/pages'),
    ];
    const forbiddenIconMarginPattern =
      /<(?:AlertTriangle|AlertCircle|Info|Loader2|Sparkles)\b[^>]*className=(?:"[^"]*\bmt-0\.5\b[^"]*"|{`[^`]*\bmt-0\.5\b[^`]*`})/g;
    const offenders = files.flatMap((file) => {
      const source = readRepoFile(file);
      return [...source.matchAll(forbiddenIconMarginPattern)].map((match) => `${file}: ${match[0]}`);
    });

    expect(offenders).toEqual([]);
  });

  it('已治理的设置页提示行统一消费 InlineNotice', () => {
    for (const relativePath of [
      'src/components/chat/settings/McpServerEditorDialog.tsx',
      'src/components/chat/settings/PerformancePanel.tsx',
      'src/components/chat/settings/SitePermissionsPanel.tsx',
      'src/components/chat/settings/model-manager/ModelManagerHealthDialog.tsx',
      'src/components/chat/settings/model-manager/panel/ModelManagerProviderDetail.tsx',
      'src/components/chat/WebSearchResultsBlock.tsx',
      'src/pages/paint/PaintSettingsPanel.tsx',
    ]) {
      expect(readRepoFile(relativePath), `${relativePath} should use InlineNotice`).toContain('InlineNotice');
    }
  });
});
