/**
 * 说明：`model-manager-responsive-layout.guard` 源码模块。
 *
 * 职责：
 * - 固化模型管理面板的容器查询布局契约；
 * - 防止 provider 列表和模型行再次退回按 viewport breakpoint 或横向滚动止血；
 * - 保证窄容器下模型名、能力 badge 与操作按钮各有稳定布局槽位。
 *
 * 边界：
 * - 本 guard 只检查静态布局真源；
 * - provider/model 数据、排序、搜索、拖拽交互由对应组件测试和 E2E 覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * 读取源码文件内容。
 *
 * @param relativePath - 相对仓库根目录的文件路径。
 * @returns 源码文本。
 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('model manager responsive layout guard', () => {
  it('模型管理面板使用组件容器查询驱动窄宽布局', () => {
    const cssText = readRepoFile('src/index.css');
    const panelText = readRepoFile('src/components/chat/settings/model-manager/panel/ModelManagerPanelView.tsx');
    const sidebarText = readRepoFile('src/components/chat/settings/model-manager/panel/ModelManagerProviderSidebar.tsx');

    expect(panelText).toContain('data-model-manager-panel-container');
    expect(panelText).toContain('model-manager-layout flex h-full min-h-0 min-w-0');
    expect(sidebarText).toContain('model-manager-provider-nav flex min-h-0 min-w-0');
    expect(cssText).toContain('[data-model-manager-panel-container] {');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('@container (max-width: 700px)');
    expect(cssText).toContain('.model-manager-layout');
    expect(cssText).toContain('flex-direction: column;');
    expect(cssText).toContain('.model-manager-provider-nav');
    expect(cssText).toContain('width: 100%;');
    expect(sidebarText).toContain('Select value={selectedProvider?.id ?? selectedId} onValueChange={setSelectedId}');
    expect(sidebarText).toContain('data-testid="model-manager-provider-compact-select"');
    expect(sidebarText).toContain('data-testid="model-manager-provider-compact-select-value"');
    expect(sidebarText).toContain('textValue={displayName}');
    expect(sidebarText).toContain('providers.map((provider) =>');
    expect(cssText).toContain('.model-manager-provider-compact-select');
    expect(cssText).toContain('display: none;');
    expect(cssText).toContain('.model-manager-provider-search');
    expect(cssText).toContain('.model-manager-provider-scroll-shell');
    expect(cssText).toContain('display: flex;');
    expect(cssText).toContain('.model-manager-provider-toolbar-inner');
    expect(cssText).toContain('flex-direction: row !important;');
    expect(cssText).toContain('border-right-width: 0 !important;');
    expect(cssText).toContain('border-bottom-width: 1px !important;');
    expect(cssText).not.toContain('max-height: clamp(5rem, 13dvh, 8rem);');
    expect(cssText).not.toContain('max-height: clamp(4rem, 10dvh, 5.5rem);');
  });

  it('已添加模型行使用 row-as-container 与内部 grid 保护名称、badge 与操作按钮', () => {
    const cssText = readRepoFile('src/index.css');
    const detailText = readRepoFile('src/components/chat/settings/model-manager/panel/ModelManagerProviderDetail.tsx');
    const modelManagerCss = cssText.slice(
      cssText.indexOf('[data-model-manager-panel-container]'),
      cssText.indexOf('[data-chat-composer-shell]'),
    );

    expect(detailText).toContain('className="model-manager-model-row min-w-0');
    expect(detailText).toContain('model-manager-model-row-grid');
    expect(detailText).toContain('model-manager-model-row-title min-w-0');
    expect(detailText).toContain('model-manager-model-row-badges min-w-0');
    expect(detailText).toContain('model-manager-model-row-actions');
    expect(detailText).toContain('flex h-7 w-7 items-center justify-center');
    expect(cssText).toContain('.model-manager-model-row {');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('.model-manager-model-row-grid {');
    expect(cssText).toContain('grid-template-columns: auto minmax(6rem, 1fr) minmax(6rem, min(18rem, 44cqw)) auto;');
    expect(cssText).toContain('max-width: min(18rem, 44cqw);');
    expect(cssText).toContain('flex-wrap: nowrap;');
    expect(cssText).toContain('grid-row: 1;');
    expect(cssText).toContain('grid-column: 2 / 4;');
    expect(cssText).toContain('@container (max-width: 430px)');
    expect(cssText).toContain('grid-row: 2;');
    expect(cssText).toContain('justify-content: flex-end;');
    expect(modelManagerCss).not.toContain('@container (min-width: 720px)');
    expect(modelManagerCss).not.toContain('overflow-x: auto');
  });

  it('模型列表高度来自详情区剩余空间，并允许详情页插入可变数量配置区', () => {
    const cssText = readRepoFile('src/index.css');
    const detailText = readRepoFile('src/components/chat/settings/model-manager/panel/ModelManagerProviderDetail.tsx');

    expect(detailText).toContain('data-testid="model-manager-provider-detail-body"');
    expect(detailText).toContain('data-testid="model-manager-provider-detail" className="relative flex min-h-0 min-w-0 flex-1 flex-col"');
    expect(detailText).toContain('model-manager-provider-detail-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(detailText).toContain('[scrollbar-gutter:stable]');
    expect(detailText).toContain('data-testid="model-manager-provider-detail-bottom-safe-area"');
    expect(detailText).toContain('model-manager-provider-detail-bottom-safe-area pointer-events-none absolute inset-x-0 bottom-0');
    expect(detailText).toContain('data-testid="model-manager-provider-detail-tail-spacer"');
    expect(detailText).toContain('className="model-manager-provider-detail-tail-spacer"');
    expect(detailText).not.toContain('className="min-h-0 min-w-0 flex-1 overflow-hidden');
    expect(detailText).toContain('model-manager-provider-detail-grid');
    expect(detailText).toContain('className="model-manager-provider-detail-grid min-h-full min-w-0"');
    expect(detailText).not.toContain('className="model-manager-provider-detail-grid min-h-full min-w-0 pb-4');
    expect(detailText).not.toContain('min-[960px]:pb-6');
    expect(cssText).toContain('--model-manager-detail-bottom-space: 1rem;');
    expect(cssText).toContain('--model-manager-model-section-min: 15rem;');
    expect(cssText).toContain('--model-manager-model-list-min: 12rem;');
    expect(cssText).toContain(`@media (min-width: 960px) {
    [data-model-manager-panel-container] {
      --model-manager-detail-bottom-space: 1.5rem;
    }
  }`);
    expect(cssText).toContain(`@media (max-height: 720px) {
    [data-model-manager-panel-container] {
      --model-manager-model-section-min: 13rem;
      --model-manager-model-list-min: 9.5rem;
    }
  }`);
    expect(cssText).toContain(`@media (max-height: 560px) {
    [data-model-manager-panel-container] {
      --model-manager-model-section-min: 11.5rem;
      --model-manager-model-list-min: 8rem;
    }
  }`);
    expect(cssText).toContain(`[data-model-manager-panel-container] .model-manager-provider-detail-body {
    min-width: 0;
    min-height: 0;
    padding-bottom: var(--model-manager-detail-bottom-space);
    scroll-padding-bottom: var(--model-manager-detail-bottom-space);
  }`);
    expect(cssText).toContain(`[data-model-manager-panel-container] .model-manager-provider-detail-bottom-safe-area {
    z-index: 1;
    height: var(--model-manager-detail-bottom-space);
    background: hsl(var(--background));
  }`);
    expect(cssText).toContain(`[data-model-manager-panel-container] .model-manager-provider-detail-tail-spacer {
    height: calc(var(--model-manager-detail-bottom-space) + 0.75rem);
  }`);
    expect(cssText).toContain(`[data-model-manager-panel-container] .model-manager-provider-detail-grid {
    display: flex;
    flex-direction: column;`);
    expect(cssText).toContain('min-height: 100%;');
    expect(detailText).toContain('data-testid="model-manager-model-section"');
    expect(detailText).toContain('className="model-manager-model-section min-w-0"');
    expect(detailText).not.toContain('className="model-manager-model-section min-h-0 min-w-0"');
    expect(cssText).toContain(`[data-model-manager-panel-container] .model-manager-model-section {
    display: grid;
    grid-template-rows: auto minmax(var(--model-manager-model-list-min), 1fr);
    flex: 1 1 var(--model-manager-model-section-min);`);
    expect(cssText).toContain('min-height: var(--model-manager-model-section-min);');
    expect(cssText).not.toContain('grid-template-rows: auto minmax(5rem, 1fr);');
    expect(cssText).not.toContain('flex: 1 1 10rem;');
    expect(cssText).not.toContain('flex: 1 0 15rem;');
    expect(cssText).not.toContain('[data-extension-settings-panel-container] .model-manager-provider-detail-body');
    expect(cssText).not.toContain('[data-extension-settings-panel-container] .model-manager-provider-detail-grid');
    expect(cssText).not.toContain('[data-extension-settings-panel-container] .model-manager-model-section');
    expect(cssText).not.toContain('grid-template-rows: auto auto minmax');
    expect(detailText).toContain('className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-border"');
    expect(detailText).toContain('className="h-full overflow-y-auto"');
    expect(detailText).not.toContain('calc(100dvh');
    expect(detailText).not.toContain('min-h-[12rem]');
    expect(detailText).not.toContain('h-[clamp(18rem');
    expect(detailText).not.toContain('min-h-[18rem]');
  });

  it('Provider 详情头部检测按钮保留固定右侧槽位，不继承设置行按钮拉伸规则', () => {
    const detailText = readRepoFile('src/components/chat/settings/model-manager/panel/ModelManagerProviderDetail.tsx');

    expect(detailText).toContain('className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"');
    expect(detailText).toContain('data-testid="model-manager-provider-summary-actions"');
    expect(detailText).toContain('className="model-manager-provider-summary-actions flex shrink-0 items-center justify-end gap-2"');
    expect(detailText).toContain('className="h-9 shrink-0 whitespace-nowrap px-4 text-sm"');
    expect(detailText).not.toContain('settings-responsive-actions flex flex-wrap items-center justify-start gap-2 min-[960px]:justify-end');
  });
});
