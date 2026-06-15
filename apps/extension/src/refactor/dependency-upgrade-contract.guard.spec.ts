/**
 * 说明：依赖升级后的前端运行时契约 guard。
 *
 * 职责：
 * - 防止 React 19 / React Router 7 升级后重新引入旧 React DOM API；
 * - 防止 page-facing overlay 和首页 overlay 被懒加载时序打散；
 * - 防止 React 19 类型迁移后重新依赖全局 `JSX.Element` 命名空间或 `@ts-ignore`。
 *
 * 边界：
 * - 本文件只做源码静态契约扫描；
 * - 路由页级懒加载继续由既有白名单文件承载，不在这里改变构建切分策略。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(THIS_DIR, '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const PAGE_FACING_OVERLAY_ROOTS = [
  'extension/content-script',
  'plugins/page-tools/screenshot-capture/content',
];
const INDEX_OVERLAY_FILES = [
  'pages/index-page/IndexPageOverlays.tsx',
  'pages/index-page/IndexPageView.tsx',
];

type DynamicImportFinding = {
  /** 违规文件路径。 */
  readonly relativePath: string;
  /** 动态 import 目标。 */
  readonly specifier: string;
};

type LazyOrSuspenseFinding = {
  /** 违规文件路径。 */
  readonly relativePath: string;
  /** 违规调用或 JSX 名称。 */
  readonly kind: string;
};

/** 判断文件是否属于运行时源码。 */
function isRuntimeSourceFile(relativePath: string) {
  const extension = path.extname(relativePath);
  if (!SOURCE_EXTENSIONS.has(extension)) return false;
  return !relativePath.endsWith('.spec.ts')
    && !relativePath.endsWith('.spec.tsx')
    && !relativePath.endsWith('.test.ts')
    && !relativePath.endsWith('.test.tsx')
    && !relativePath.endsWith('.d.ts');
}

/**
 * 递归收集源码文件。
 *
 * @param relativeDirectory - 相对 `src/` 的目录。
 * @returns 运行时源码路径列表。
 */
function listRuntimeFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const childRelativePath = path.join(relativeDirectory, entry.name);
    const childAbsolutePath = path.join(SRC_ROOT, childRelativePath);
    if (entry.isDirectory()) return listRuntimeFiles(childRelativePath);
    if (!entry.isFile()) return [];
    const normalized = childRelativePath.replace(/\\/g, '/');
    return isRuntimeSourceFile(normalized) ? [childAbsolutePath] : [];
  });
}

/**
 * 读取相对 `src/` 的文件内容。
 *
 * @param relativePath - 相对路径。
 * @returns 文件源码文本。
 */
function readSource(relativePath: string) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

/**
 * 获取绝对源码路径的仓库相对路径。
 *
 * @param absolutePath - 绝对路径。
 * @returns 相对 `src/` 的 POSIX 路径。
 */
function toSrcRelativePath(absolutePath: string) {
  return path.relative(SRC_ROOT, absolutePath).replace(/\\/g, '/');
}

/**
 * 解析源码并收集动态 import、React.lazy 和 Suspense 使用。
 *
 * @param relativePath - 相对 `src/` 的源码路径。
 * @returns 当前文件中的升级风险点。
 */
function inspectOverlaySource(relativePath: string) {
  const sourceText = readSource(relativePath);
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dynamicImports: string[] = [];
  const lazyOrSuspense: string[] = [];

  /**
   * 遍历 TypeScript AST，收集与 overlay 时序相关的节点。
   *
   * @param node - 当前 AST 节点。
   */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [firstArgument] = node.arguments;
        dynamicImports.push(ts.isStringLiteralLike(firstArgument) ? firstArgument.text : '<non-literal>');
      }

      const expression = node.expression;
      const isLazyCall = (ts.isIdentifier(expression) && expression.text === 'lazy')
        || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'lazy');
      if (isLazyCall) lazyOrSuspense.push('React.lazy');
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === 'Suspense' || tagName === 'React.Suspense') lazyOrSuspense.push(tagName);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { dynamicImports, lazyOrSuspense };
}

describe('dependency upgrade contract guard', () => {
  it('blocks legacy React DOM APIs and React 18-only type escapes', () => {
    const files = listRuntimeFiles();
    const offenders = files.flatMap((absolutePath) => {
      const relativePath = toSrcRelativePath(absolutePath);
      const text = fs.readFileSync(absolutePath, 'utf8');
      const findings = [
        text.includes('ReactDOM.render') ? 'ReactDOM.render' : null,
        text.includes('findDOMNode') ? 'findDOMNode' : null,
        text.includes('react-dom/test-utils') ? 'react-dom/test-utils' : null,
        /\bJSX\.Element\b/.test(text) ? 'JSX.Element' : null,
        /\/\/\s*@ts-ignore\b/.test(text) ? '@ts-ignore' : null,
      ].filter((finding): finding is string => finding !== null);
      return findings.map((finding) => ({ relativePath, finding }));
    });

    expect(offenders).toEqual([]);
  });

  it('keeps page-facing overlays and index overlays synchronously mounted', () => {
    const overlayFiles = [
      ...PAGE_FACING_OVERLAY_ROOTS.flatMap(listRuntimeFiles).map(toSrcRelativePath),
      ...INDEX_OVERLAY_FILES,
    ];

    const dynamicImportOffenders: DynamicImportFinding[] = [];
    const lazyOrSuspenseOffenders: LazyOrSuspenseFinding[] = [];

    for (const relativePath of overlayFiles) {
      const inspection = inspectOverlaySource(relativePath);
      for (const specifier of inspection.dynamicImports) {
        dynamicImportOffenders.push({ relativePath, specifier });
      }
      for (const kind of inspection.lazyOrSuspense) {
        lazyOrSuspenseOffenders.push({ relativePath, kind });
      }
    }

    expect(dynamicImportOffenders).toEqual([]);
    expect(lazyOrSuspenseOffenders).toEqual([]);
  });
});
