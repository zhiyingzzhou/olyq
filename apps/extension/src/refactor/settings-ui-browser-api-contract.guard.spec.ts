/**
 * 说明：`settings-ui-browser-api-contract.guard.spec` 源码模块。
 *
 * 职责：
 * - 防止设置页 UI 面板重新散落 direct extension browser API 调用；
 * - 强制设置页只通过 `runtime-api`、`ui-actions` 或域级 helper 读取扩展能力；
 * - 把设置页运行时边界从人工约定升级为静态 guard。
 *
 * 边界：
 * - 只扫描 `components/chat/settings` 下非测试 React/Hook 代码；
 * - 测试 mock、底层 runtime helper 和后台代码不属于本 guard 范围。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_ROOT = path.join(SRC_ROOT, 'components/chat/settings');

/**
 * 递归列出设置页运行时代码文件。
 *
 * @param directory - 当前绝对目录。
 * @returns 设置页下所有非测试 TypeScript / TSX 文件。
 */
function listSettingsRuntimeFiles(directory = SETTINGS_ROOT): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSettingsRuntimeFiles(absolutePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

/**
 * 判断属性访问是否命中 direct extension browser API。
 *
 * @param node - 待检查的属性访问表达式。
 * @returns 是否属于违规访问。
 */
function isDirectExtensionApiAccess(node: ts.PropertyAccessExpression): boolean {
  if (ts.isIdentifier(node.expression) && node.expression.text === 'chrome') return true;
  if (
    ts.isIdentifier(node.expression)
    && node.expression.text === 'globalThis'
    && node.name.text === 'chrome'
  ) {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'globalThis'
    && node.expression.name.text === 'chrome'
  ) {
    return true;
  }
  return false;
}

/**
 * 收集设置页 direct extension browser API 违规点。
 *
 * @returns 文件与行号列表。
 */
function collectSettingsDirectApiOffenders(): string[] {
  return listSettingsRuntimeFiles().flatMap((absolutePath) => {
    const relativePath = path.relative(SRC_ROOT, absolutePath).split(path.sep).join('/');
    const sourceText = fs.readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const offenders: string[] = [];

    /**
     * 深度遍历 AST，定位设置页 direct extension browser API。
     *
     * @param node - 当前 AST 节点。
     */
    function visit(node: ts.Node): void {
      if (ts.isPropertyAccessExpression(node) && isDirectExtensionApiAccess(node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        offenders.push(`${relativePath}:${line + 1}:${character + 1} ${node.getText(sourceFile)}`);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return offenders;
  });
}

describe('settings ui browser api boundary guard', () => {
  it('disallows direct extension browser API usage in settings UI files', () => {
    expect(collectSettingsDirectApiOffenders()).toEqual([]);
  });
});
