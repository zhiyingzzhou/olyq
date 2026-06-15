/**
 * 说明：`tooltip-contract.guard.spec` 源码模块。
 *
 * 职责：
 * - 防止 React UI 里的交互式 trigger 再次把原生 `title` 当成 hover hint 真源；
 * - 防止 content-script 的 shadow UI 再次写回原生 `title=`；
 * - 把“扩展自有交互入口统一走 tooltip contract”固化成静态 guard。
 *
 * 边界：
 * - React guard 只拦交互式 JSX trigger，不误伤纯文本 reveal；
 * - content-script guard 只拦模板级 title attribute / setAttribute，不限制 `document.title` 等页面元数据读取。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTERACTIVE_REACT_TAGS = new Set([
  'button',
  'a',
  'input',
  'label',
  'select',
  'textarea',
  'Button',
  'Toggle',
  'ToggleGroupItem',
  'MessageBubbleActionButton',
  'CapabilityPill',
  'ThemeToggle',
]);
const INTERACTIVE_REACT_ATTRIBUTES = new Set([
  'onClick',
  'onDoubleClick',
  'onKeyDown',
  'onMouseDown',
  'onMouseUp',
  'onPointerDown',
  'onPointerUp',
  'onSelect',
]);

/**
 * 递归列出指定目录下的运行时代码文件。
 *
 * @param relativeDirectory - 相对 `src` 的目录。
 * @returns 当前目录及其子目录下所有非测试运行时代码。
 */
function listRuntimeFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 提取 JSX tag 名称。
 *
 * @param tagName - JSX tagName 节点。
 * @returns 当前 tag 的可读名称。
 */
function getJsxTagName(tagName: ts.JsxTagNameExpression): string | null {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return null;
}

/**
 * 收集 React 运行时代码中的交互式 `title` 违规点。
 *
 * @returns 违规文件与行号列表。
 */
function collectReactInteractiveTitleOffenders(): string[] {
  return listRuntimeFiles()
    .filter((relativePath) => /\.(tsx|jsx)$/.test(relativePath))
    .filter((relativePath) => !relativePath.startsWith('extension/content-script/'))
    .flatMap((relativePath) => {
      const absolutePath = path.join(SRC_ROOT, relativePath);
      const sourceText = fs.readFileSync(absolutePath, 'utf8');
      const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const offenders: string[] = [];

      /**
       * 深度遍历 AST，定位交互式 JSX trigger 上的 `title`。
       *
       * @param node - 当前 AST 节点。
       */
      function visit(node: ts.Node): void {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = getJsxTagName(node.tagName);
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
          const hasTitle = attributes.find((attr) => ts.isIdentifier(attr.name) && attr.name.text === 'title');
          const hasInteractiveAttribute = attributes.some((attr) => {
            return ts.isIdentifier(attr.name) && INTERACTIVE_REACT_ATTRIBUTES.has(attr.name.text);
          });
          const isIntrinsicTag = Boolean(tagName && /^[a-z]/.test(tagName));
          if (hasTitle && tagName && (INTERACTIVE_REACT_TAGS.has(tagName) || (isIntrinsicTag && hasInteractiveAttribute))) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(hasTitle.getStart());
            offenders.push(`${relativePath}:${line + 1}:${character + 1} <${tagName}>`);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      return offenders;
    });
}

/**
 * 收集 content-script 模板里的原生 `title` attribute 违规点。
 *
 * @returns 违规文件列表。
 */
function collectContentScriptTitleAttributeOffenders(): string[] {
  const patterns = [
    /\btitle\s*=\s*["'{]/g,
    /setAttribute\(\s*['"]title['"]/g,
  ];

  return listRuntimeFiles('extension/content-script')
    .map((relativePath) => {
      const absolutePath = path.join(SRC_ROOT, relativePath);
      const sourceText = fs.readFileSync(absolutePath, 'utf8');
      const hits = patterns.filter((pattern) => pattern.test(sourceText)).length;
      return hits > 0 ? relativePath : null;
    })
    .filter((item): item is string => Boolean(item));
}

describe('tooltip contract guard', () => {
  it('disallows native title on interactive React triggers', () => {
    expect(collectReactInteractiveTitleOffenders()).toEqual([]);
  });

  it('disallows native title attributes in content-script shadow UI templates', () => {
    expect(collectContentScriptTitleAttributeOffenders()).toEqual([]);
  });
});
