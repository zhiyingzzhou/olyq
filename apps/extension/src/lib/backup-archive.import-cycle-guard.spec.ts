/**
 * 说明：`backup-archive.import-cycle-guard.spec` 备份模块。
 *
 * 职责：
 * - 承载 `backup-archive.import-cycle-guard.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(THIS_DIR, '..');
const ENTRY_FILE = path.resolve(THIS_DIR, 'backup-archive.ts');

/**
 * 解析源码模块到实际文件路径。
 *
 * @remarks
 * 这里复用 import guard 的轻量 AST/路径解析思路，不额外引入 `madge` 之类依赖。
 */
function tryResolveSourceModule(fromFile: string, specifier: string): string | null {
  const basePath = specifier.startsWith('@/') ? path.join(SRC_ROOT, specifier.slice(2)) : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    if (!candidate.startsWith(SRC_ROOT)) continue;
    if (!fs.existsSync(candidate)) continue;
    if (!fs.statSync(candidate).isFile()) continue;
    if (/\.(spec|test)\.(ts|tsx)$/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

/** 列出文件的所有静态依赖边。 */
function listStaticImports(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue;
      const specifier = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const resolved = tryResolveSourceModule(filePath, specifier);
      if (resolved) imports.add(resolved);
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const resolved = tryResolveSourceModule(filePath, specifier);
      if (resolved) imports.add(resolved);
    }
  }

  return [...imports].sort();
}

/**
 * 查找从入口文件出发、再回到入口文件的静态循环路径。
 *
 * @returns 找到时返回完整路径，否则返回 `null`。
 */
function findCyclePath(entryFile: string): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();

    /**
   * 测试辅助函数：`dfs`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function dfs(filePath: string, stack: string[]): string[] | null {
    if (visiting.has(filePath)) {
      const cycleStart = stack.indexOf(filePath);
      return cycleStart >= 0 ? [...stack.slice(cycleStart), filePath] : null;
    }
    if (visited.has(filePath)) return null;

    visiting.add(filePath);
    const nextStack = [...stack, filePath];

    for (const importedFile of listStaticImports(filePath)) {
      const cycle = dfs(importedFile, nextStack);
      if (cycle && cycle.includes(entryFile)) return cycle;
    }

    visiting.delete(filePath);
    visited.add(filePath);
    return null;
  }

  return dfs(entryFile, []);
}

describe('backup archive import cycle guard', () => {
  it('backup-archive 不应再通过静态 import 图回到自己', () => {
    const cycle = findCyclePath(ENTRY_FILE);
    const relativeCycle = cycle?.map((filePath) => path.relative(SRC_ROOT, filePath));

    expect(relativeCycle ?? []).toEqual([]);
  });
});
