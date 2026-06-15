/**
 * 说明：`tabs-flat-active-state.guard` 源码模块。
 *
 * 职责：
 * - 固化扩展内共享 tab / segmented control 的平面 active 态；
 * - 防止 Tailwind 阴影 token 升级后再次把页面内 tab 激活项渲染成浮起卡片。
 *
 * 边界：
 * - 这里只约束 `components/ui/tabs.tsx` 的默认 active trigger；
 * - dialog、popover、bottom banner 等真实浮层继续由各自组件表达阴影语义。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/** 读取仓库源码文件。 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('tabs flat active state guard', () => {
  it('共享 TabsTrigger active 态不使用阴影表达选中', () => {
    const source = readRepoFile('src/components/ui/tabs.tsx');
    const triggerIndex = source.indexOf('const TabsTrigger = React.forwardRef');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);

    const triggerSnippet = source.slice(triggerIndex, source.indexOf('TabsTrigger.displayName', triggerIndex));

    expect(triggerSnippet).toContain('data-[state=active]:shadow-none');
    expect(triggerSnippet).not.toContain('data-[state=active]:shadow-sm');
    expect(triggerSnippet).not.toContain('data-[state=active]:shadow-md');
    expect(triggerSnippet).not.toContain('data-[state=active]:shadow-lg');
  });
});
