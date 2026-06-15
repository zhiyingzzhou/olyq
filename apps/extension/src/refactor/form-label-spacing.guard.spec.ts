/**
 * 说明：表单 Label 与 Tailwind v4 间距契约 guard。
 *
 * 职责：
 * - 防止共享 Label 回退成 inline 元素，使 `space-y-*` 的块轴 margin 再次失效；
 * - 确认调用处传入的 `flex`、`inline-flex`、`sr-only` 等显示语义仍可覆盖基础 `block`。
 *
 * 边界：
 * - 本文件只做源码静态契约扫描；
 * - 真实页面几何由 Playwright 升级回归用例覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(THIS_DIR, '..');

/**
 * 读取相对 `src/` 的源码文件。
 *
 * @param relativePath - 相对路径。
 * @returns 文件源码文本。
 */
function readSource(relativePath: string) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('form label spacing contract', () => {
  it('keeps shared Label block-level by default for Tailwind v4 space-y spacing', () => {
    const labelSource = readSource('components/ui/label.tsx');

    expect(labelSource).toContain('const labelVariants = cva("block text-sm font-medium leading-none');
    expect(labelSource).toContain('className={cn(labelVariants(), className)}');
  });
});
