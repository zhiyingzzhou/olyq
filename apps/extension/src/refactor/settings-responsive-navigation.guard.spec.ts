/**
 * 说明：`settings-responsive-navigation.guard` 源码模块。
 *
 * 职责：
 * - 固化扩展设置页 640px 导航断点；
 * - 固化窄宽分类 Select 与设置 panel 容器查询契约；
 * - 防止旧横向滚动 tab 条回流。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 真实交互由 `ExtensionSettings.spec.tsx` 和设置页 E2E 覆盖。
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
 * 截取包含指定标记的 `SelectTrigger` 源码块。
 *
 * @param source - 待检查源码文本。
 * @param marker - 触发器块内必须出现的唯一标记。
 * @returns 对应 `SelectTrigger` 起止标签之间的源码。
 */
function extractSelectTriggerBlock(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const triggerStart = source.lastIndexOf('<SelectTrigger', markerIndex);
  const triggerEnd = source.indexOf('</SelectTrigger>', markerIndex);
  expect(triggerStart).toBeGreaterThanOrEqual(0);
  expect(triggerEnd).toBeGreaterThan(triggerStart);
  return source.slice(triggerStart, triggerEnd + '</SelectTrigger>'.length);
}

describe('settings responsive navigation guard', () => {
  it('设置页导航固定使用 640px 断点与窄宽分类 Select', () => {
    const settingsText = readRepoFile('src/components/chat/ExtensionSettings.tsx');

    expect(settingsText).toContain("const SETTINGS_NAV_SIDE_RAIL_QUERY = '(min-width: 640px)'");
    expect(settingsText).toContain('data-extension-settings-side-nav');
    expect(settingsText).toContain('data-extension-settings-compact-nav');
    expect(settingsText).toContain('data-testid="extension-settings-compact-select"');
    expect(settingsText).toContain("role={isSideRailNav ? 'tabpanel' : 'region'}");
    expect(settingsText).toContain('aria-labelledby={isSideRailNav ? activeTabButtonId : undefined}');
    expect(settingsText).toContain('aria-label={isSideRailNav ? undefined : t(activeTabMeta.labelKey)}');
    expect(settingsText).toContain('data-extension-settings-panel-container');
    expect(settingsText).toContain('scrollbars="vertical"');
    expect(settingsText).not.toContain('min-[520px]');
    expect(settingsText).not.toContain('wheelBehavior="horizontal"');
    expect(settingsText).not.toContain('aria-orientation="horizontal"');
  });

  it('窄宽 Select trigger 的图标标签布局不使用直接 flex span', () => {
    const settingsText = readRepoFile('src/components/chat/ExtensionSettings.tsx');
    const cloudSyncText = readRepoFile('src/components/chat/settings/CloudSyncPanel.tsx');
    const settingsCompactTrigger = extractSelectTriggerBlock(
      settingsText,
      'data-testid="extension-settings-compact-select"',
    );
    const cloudSyncCompactTrigger = extractSelectTriggerBlock(
      cloudSyncText,
      "aria-label={t('settings.cloudSync')}",
    );

    expect(settingsText).toContain('data-testid="extension-settings-compact-select-value"');
    expect(settingsText).toContain('className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"');
    expect(settingsCompactTrigger).not.toMatch(
      />\s*<span\s+className="[^"]*(?:flex|inline-flex)[^"]*"/,
    );

    expect(cloudSyncText).toContain('data-testid="cloud-sync-compact-select-value"');
    expect(cloudSyncText).toContain('className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"');
    expect(cloudSyncCompactTrigger).not.toMatch(
      />\s*<span\s+className="[^"]*(?:flex|inline-flex)[^"]*"/,
    );
  });

  it('设置 panel 响应式行只通过容器查询在窄容器下换列', () => {
    const cssText = readRepoFile('src/index.css');
    const layoutText = readRepoFile('src/components/chat/settings/layout.tsx');
    const defaultModelText = readRepoFile('src/components/chat/settings/DefaultModelPanel.tsx');
    const memoryText = readRepoFile('src/components/chat/settings/memory-panel/MemorySettingsSection.tsx');
    const cloudSyncText = readRepoFile('src/components/chat/settings/cloud-sync/shared.tsx');

    expect(cssText).toContain('[data-extension-settings-panel-container] {');
    expect(cssText).toContain('container-type: inline-size');
    expect(cssText).toContain('@container (max-width: 720px)');
    expect(cssText).toContain('[data-extension-settings-panel-container] .settings-responsive-row');
    expect(cssText).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(cssText).toContain('button:not([role="switch"]):not(.settings-responsive-icon-action)');
    expect(cssText).toContain('.settings-responsive-control > .settings-responsive-icon-action');
    expect(cssText).toContain('[data-extension-settings-panel-container] :where([role="switch"])');
    expect(cssText).toContain('flex: 0 0 auto');
    expect(cssText).toContain('@container (max-width: 560px)');
    expect(cssText).toContain('.settings-responsive-actions > :where(button:not([role="switch"]), [role="button"])');
    expect(layoutText).toContain('settings-responsive-row grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)]');
    expect(defaultModelText).toContain('settings-responsive-row');
    expect(defaultModelText).toContain('settings-responsive-control');
    expect(memoryText).toContain('settings-responsive-row');
    expect(memoryText).toContain('settings-responsive-control');
    expect(memoryText).toContain('settings-responsive-icon-action');
    expect(cloudSyncText).toContain('settings-responsive-row grid');
    expect(cloudSyncText).toContain('settings-responsive-control');
  });
});
