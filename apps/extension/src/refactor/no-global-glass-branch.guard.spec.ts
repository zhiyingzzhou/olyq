/**
 * 说明：`no-global-glass-branch.guard` 静态契约守卫。
 *
 * 职责：
 * - 防止扩展页重新接回全局毛玻璃显示分支；
 * - 只约束 Olyq 扩展 UI / 启动代码，不约束网页风格分析里的“玻璃态”识别语义。
 *
 * 边界：
 * - 本文件只做源码静态扫描；
 * - 局部 overlay 若显式使用 `backdrop-blur`，仍按各自组件契约治理。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');
const SCAN_ROOTS = ['index.html', 'public', 'src'] as const;
const FORBIDDEN_GLOBAL_GLASS_TOKENS = [
  'glassMorphism',
  'data-glass',
  'applyGlassMorphism',
  'glass-panel',
  'glass-card',
  'glass-toolbar',
] as const;

/**
 * 判断某个源码路径是否属于本 guard 不扫描的区域。
 *
 * @param relativePath - 相对仓库根目录的路径。
 * @returns 是否应该跳过。
 */
function shouldSkip(relativePath: string): boolean {
  return (
    relativePath.startsWith('src/refactor/')
    || /\.spec\.[cm]?[tj]sx?$/.test(relativePath)
    || /\.test\.[cm]?[tj]sx?$/.test(relativePath)
  );
}

/**
 * 枚举需要扫描的源码文件。
 *
 * @param root - 相对仓库根目录的扫描入口。
 * @returns 文件路径列表。
 */
function listFiles(root: string): string[] {
  const absolute = path.join(REPO_ROOT, root);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [root];

  return fs.readdirSync(absolute).flatMap((entry) => {
    const relativePath = path.join(root, entry);
    const entryStat = fs.statSync(path.join(REPO_ROOT, relativePath));
    if (entryStat.isDirectory()) return listFiles(relativePath);
    return [relativePath];
  });
}

describe('no global glass branch guard', () => {
  it('扩展 UI 与启动代码不再保留全局毛玻璃分支', () => {
    const offenders: string[] = [];

    for (const filePath of SCAN_ROOTS.flatMap((root) => listFiles(root))) {
      if (shouldSkip(filePath)) continue;
      const text = fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf8');
      for (const token of FORBIDDEN_GLOBAL_GLASS_TOKENS) {
        if (text.includes(token)) offenders.push(`${filePath}: ${token}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
