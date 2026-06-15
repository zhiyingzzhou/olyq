/**
 * 说明：`tsdoc-coverage.guard.spec` 源码模块。
 *
 * 职责：
 * - 校验当前仓库根应用包范围内的 TypeScript/Tsx 文件文件头是否齐全；
 * - 校验顶层导出声明是否带有中文 TSDoc，避免后续提交再次引入“导出 API 无文档”的回退；
 * - 校验函数、方法和函数型变量是否带有中文文档，避免实现入口再次退回“只有导出有注释”的状态；
 * - 与 ESLint 的 `tsdoc/syntax` 分工配合：这里管“是否存在”，语法细节继续交给 lint。
 *
 * 边界：
 * - 本文件只做静态注释覆盖率守卫，不评估注释语义是否足够详细，也不替代人工代码评审。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OWNED_TOP_LEVEL_DIRS = new Set(['src', 'e2e']);
const OWNED_TOP_LEVEL_FILES = new Set(['playwright.config.ts', 'vitest.config.ts']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * 递归收集扩展包内所有 TypeScript 源文件。
 *
 * @param dir - 当前扫描目录。
 * @param out - 累积出来的文件列表。
 * @returns 当前目录及其子目录下的所有 `.ts/.tsx` 文件。
 */
function collectTypeScriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === PACKAGE_ROOT && entry.isDirectory() && !OWNED_TOP_LEVEL_DIRS.has(entry.name)) {
      continue;
    }
    if (dir === PACKAGE_ROOT && entry.isFile() && !OWNED_TOP_LEVEL_FILES.has(entry.name)) {
      continue;
    }
    if (entry.name === 'node_modules' || entry.name === '.turbo' || entry.name.startsWith('dist')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(fullPath, out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    out.push(fullPath);
  }
  return out;
}

/**
 * 判断源码顶部是否已经带有标准文件头说明。
 *
 * @param sourceText - 文件完整内容。
 * @returns 文件最前方已有 `说明 / 职责 / 边界` 文件头时返回 `true`。
 */
function hasFileHeader(sourceText: string): boolean {
  const trimmed = sourceText.replace(/^\uFEFF/u, '').trimStart();
  return trimmed.startsWith('/**\n * 说明：') || trimmed.startsWith('/**\r\n * 说明：');
}

/**
 * 判断顶层导出声明前是否存在 JSDoc/TSDoc。
 *
 * @param node - 当前顶层语句节点。
 * @param sourceText - 文件完整内容。
 * @returns 顶层节点前已有块注释文档时返回 `true`。
 */
function hasJsDoc(node: ts.Node, sourceText: string): boolean {
  const ranges = ts.getLeadingCommentRanges(sourceText, node.pos) ?? [];
  return ranges.some((range) => sourceText.slice(range.pos, range.end).startsWith('/**'));
}

/**
 * 判断一个顶层语句是否属于真正的导出声明。
 *
 * @param node - 顶层语句节点。
 * @returns 带 `export/default` 修饰符时返回 `true`。
 */
function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword,
    ),
  );
}

/**
 * 判断变量初始化器是否属于函数型实现。
 *
 * @param initializer - 变量初始化器。
 * @returns 属于箭头函数、函数表达式或 `forwardRef/memo` 包装器时返回 `true`。
 */
function isFunctionLikeInitializer(initializer: ts.Expression): boolean {
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return true;
  if (!ts.isCallExpression(initializer)) return false;
  const callee = initializer.expression;
  const calleeName = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)
      ? callee.name.text
      : '';
  if (!['forwardRef', 'memo'].includes(calleeName)) return false;
  const [firstArg] = initializer.arguments;
  return Boolean(firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)));
}

/**
 * 收集一个文件里缺失中文文档的函数型入口。
 *
 * @param sourceFile - TypeScript 源文件。
 * @param sourceText - 文件完整内容。
 * @returns 适合直接出现在断言中的缺失摘要列表。
 */
function collectMissingFunctionDocs(sourceFile: ts.SourceFile, sourceText: string): string[] {
  const missing: string[] = [];

  /**
   * 深度遍历 AST，定位未写文档的函数型节点。
   *
   * @param node - 当前节点。
   */
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && !hasJsDoc(node, sourceText)) {
      missing.push(`function:${node.name.text}`);
    }

    if (ts.isVariableStatement(node) && !hasJsDoc(node, sourceText)) {
      const names = node.declarationList.declarations.flatMap((declaration) => (
        ts.isIdentifier(declaration.name) && declaration.initializer && isFunctionLikeInitializer(declaration.initializer)
          ? [declaration.name.text]
          : []
      ));
      if (names.length > 0) {
        missing.push(`variable:${names.join(',')}`);
      }
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && !hasJsDoc(node, sourceText)) {
      missing.push(`method:${node.name.text}`);
    }

    if (ts.isGetAccessorDeclaration(node) && ts.isIdentifier(node.name) && !hasJsDoc(node, sourceText)) {
      missing.push(`getter:${node.name.text}`);
    }

    if (ts.isSetAccessorDeclaration(node) && ts.isIdentifier(node.name) && !hasJsDoc(node, sourceText)) {
      missing.push(`setter:${node.name.text}`);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return missing;
}

/**
 * 为失败断言构建更易读的路径。
 *
 * @param filePath - 绝对路径。
 * @returns 相对当前仓库根应用包的路径。
 */
function toRelativePath(filePath: string): string {
  return path.relative(PACKAGE_ROOT, filePath);
}

describe('tsdoc coverage guard', () => {
  it('keeps browser-extension TypeScript files documented at file, export, and function level', () => {
    const offenders = collectTypeScriptFiles(PACKAGE_ROOT)
      .map((filePath) => {
        const sourceText = fs.readFileSync(filePath, 'utf8');
        const sourceFile = ts.createSourceFile(
          filePath,
          sourceText,
          ts.ScriptTarget.Latest,
          false,
          filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );

        const missingExports = sourceFile.statements
          .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
          .filter(isExported)
          .filter((statement) => !hasJsDoc(statement, sourceText))
          .map((statement) => statement.getText(sourceFile).slice(0, 80));
        const missingFunctions = collectMissingFunctionDocs(sourceFile, sourceText);

        if (!hasFileHeader(sourceText) || missingExports.length > 0 || missingFunctions.length > 0) {
          return {
            file: toRelativePath(filePath),
            missingFileHeader: !hasFileHeader(sourceText),
            missingExports,
            missingFunctions,
          };
        }
        return null;
      })
      .filter(Boolean);

    expect(offenders).toEqual([]);
  }, 30_000);
});
