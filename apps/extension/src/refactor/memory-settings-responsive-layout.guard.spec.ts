/**
 * 说明：`memory-settings-responsive-layout.guard` 源码模块。
 *
 * 职责：
 * - 固化全局记忆设置页模型说明与选择器的对齐 owner；
 * - 固化全局记忆启用开关在窄容器下仍停留在右侧槽位；
 * - 防止 Memory 局部布局修复扩散到通用设置行契约。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 真实几何表现由设置页 E2E 覆盖。
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

describe('memory settings responsive layout guard', () => {
  it('模型说明由 label 后的共享帮助提示承担，不再常驻在选择器 field 下方', () => {
    const memoryText = readRepoFile('src/components/chat/settings/memory-panel/MemorySettingsSection.tsx');
    const cssText = readRepoFile('src/index.css');

    expect(memoryText).toContain("import { HelpTip } from '@/components/ui/help-tip'");
    expect(memoryText).toContain('memory-setting-label flex min-w-0 items-center gap-1');
    expect(memoryText).toContain('<HelpTip content={helpText} side="top" align="start" contentClassName="max-w-sm" />');
    expect(memoryText).toContain('memory-model-picker-field');
    expect(memoryText).toContain('memory-model-picker-control');
    expect(memoryText).toContain('memory-model-picker-shell');
    expect(memoryText).toContain('memory-model-picker-trigger');
    expect(memoryText).toContain('memory-model-picker-clear');
    expect(memoryText).toContain("t('memory.clearModelSelection'");
    expect(memoryText).not.toContain('memory-model-picker-description');
    expect(memoryText).not.toContain('memory-model-picker-description ml-6');
    expect(memoryText).not.toContain('ml-6 mt-0.5');
    expect(memoryText).not.toContain('mt-0.5 text-xs text-muted-foreground');
    expect(memoryText).not.toContain('memory-model-picker-control flex min-w-0 items-center gap-2');
    expect(memoryText).not.toContain('settings-responsive-icon-action h-8 w-8 shrink-0');

    expect(cssText).toContain('[data-extension-settings-panel-container] .memory-model-picker-field');
    expect(cssText).toContain('[data-extension-settings-panel-container] .memory-model-picker-shell');
    expect(cssText).not.toContain('[data-extension-settings-panel-container] .memory-model-picker-description');
  });

  it('Memory 启用开关在窄设置容器下保持右侧槽位', () => {
    const memoryText = readRepoFile('src/components/chat/settings/memory-panel/MemorySettingsSection.tsx');
    const cssText = readRepoFile('src/index.css');

    expect(memoryText).toContain('memory-switch-row settings-responsive-row');
    expect(memoryText).toContain('memory-switch-control settings-responsive-control');
    expect(cssText).toContain('@container (max-width: 720px)');
    expect(cssText).toContain('[data-extension-settings-panel-container] .memory-switch-row');
    expect(cssText).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(cssText).toContain('[data-extension-settings-panel-container] .memory-switch-control');
    expect(cssText).toContain('justify-self: end;');
    expect(cssText).toContain('width: auto;');
  });

  it('Memory 局部修复不改通用设置行 owner', () => {
    const layoutText = readRepoFile('src/components/chat/settings/layout.tsx');
    const cssText = readRepoFile('src/index.css');

    expect(layoutText).not.toContain('memory-model-picker');
    expect(layoutText).not.toContain('memory-switch');
    expect(cssText).toContain('[data-extension-settings-panel-container] .settings-responsive-row');
    expect(cssText).toContain('grid-template-columns: minmax(0, 1fr)');
  });
});
