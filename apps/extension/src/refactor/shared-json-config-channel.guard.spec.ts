/**
 * 说明：`shared-json-config-channel.guard.spec` 源码模块。
 *
 * 职责：
 * - 防止新的业务模块继续 direct import `json-storage` 基础组合协议；
 * - 把当前仍允许直接读写共享 JSON 的历史边界显式收成 allowlist；
 * - 对轻量共享配置，强制后续统一走 `createSharedJsonConfigChannel` 或域级 helper。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_STORAGE_IMPORT_MARKERS = new Set([
  '@/lib/storage/json-storage',
  './json-storage',
  '../storage/json-storage',
]);
const GUARDED_JSON_STORAGE_HELPERS = new Set([
  'readBootstrapStoredJsonSeed',
  'removeStoredJson',
  'readStoredJson',
  'subscribeStoredKeys',
  'writeStoredJson',
  'writeStoredJsonInBackground',
]);
const STORAGE_ASYNC_IIFE_MARKERS = new Set([
  'ensureLegalPresetRemediation',
  'getStorageAdapter',
  'readStoredJson',
  'removeStoredJson',
  'storageEngine',
  'writeStoredJson',
]);
const ALLOWED_JSON_STORAGE_IMPORTS = new Set([
  'components/chat/chat-input/useInputLayoutState.ts',
  'extension/background/content-script-manager.ts',
  'hooks/useAssistantStore.ts',
  'hooks/useChatSettingsStore.ts',
  'hooks/useChatStore.ts',
  'hooks/useChromeStorageConfig.ts',
  'hooks/usePromptStore.ts',
  'i18n/index.ts',
  'lib/ai/api-key-rotation-state.ts',
  'lib/ai/openai-responses-store-capability.ts',
  'lib/ai/provider-storage.ts',
  'lib/browser-context/page-style-context.ts',
  'lib/chat/message-change-signal.ts',
  'lib/chat/workspace-startup-state.ts',
  'lib/extension/extension-page-startup.ts',
  'lib/legal/preset-remediation.ts',
  'lib/storage/json-storage.ts',
  'lib/storage/reload-signal.ts',
  'lib/storage/shared-json-config-channel.ts',
  'lib/sync/hlc.ts',
  'lib/sync/runtime-local-store.ts',
  'lib/sync/sync-engine.ts',
  'lib/workspaces/paint-workspace.ts',
]);

/**
 * 递归列出 `src` 下所有运行时代码文件。
 *
 * @param relativeDirectory - 相对 `src` 的目录。
 * @returns 非测试运行时代码路径列表。
 */
function listRuntimeFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 判断 import 源是否指向 `json-storage`。
 *
 * @param importText - import 源文本。
 * @returns 是否命中 `json-storage`。
 */
function isJsonStorageImport(importText: string): boolean {
  const normalized = String(importText || '').trim();
  if (JSON_STORAGE_IMPORT_MARKERS.has(normalized)) return true;
  return normalized.endsWith('/json-storage');
}

/**
 * 收集某个文件 direct import 的受保护 `json-storage` helper。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 当前文件命中的 helper 名称。
 */
function collectGuardedJsonStorageImports(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const importedHelpers = new Set<string>();

  sourceFile.forEachChild((node) => {
    if (
      !ts.isImportDeclaration(node)
      || !ts.isStringLiteral(node.moduleSpecifier)
      || !isJsonStorageImport(node.moduleSpecifier.text)
      || !node.importClause?.namedBindings
      || !ts.isNamedImports(node.importClause.namedBindings)
    ) {
      return;
    }
    for (const element of node.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (GUARDED_JSON_STORAGE_HELPERS.has(importedName)) {
        importedHelpers.add(importedName);
      }
    }
  });

  return Array.from(importedHelpers).sort();
}

/**
 * 判断 `writeStoredJson()` 调用是否已经显式处理 rejection。
 *
 * @param node - 当前源码节点。
 * @returns 是否属于 `await writeStoredJson(...)` 或 `writeStoredJson(...).catch(...)`。
 */
function isHandledWriteStoredJsonCall(node: ts.CallExpression): boolean {
  const parent = node.parent;
  if (ts.isAwaitExpression(parent)) return true;
  if (
    ts.isCallExpression(parent)
    && ts.isIdentifier(parent.expression)
    && parent.expression.text === 'consumeBackgroundStoragePromise'
    && parent.arguments[0] === node
  ) {
    return true;
  }
  return (
    ts.isPropertyAccessExpression(parent)
    && parent.name.text === 'catch'
    && ts.isCallExpression(parent.parent)
  );
}

/**
 * 收集没有显式处理失败的 `writeStoredJson()` 调用。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 当前文件中的违规调用位置。
 */
function collectUnhandledWriteStoredJsonCalls(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];

  /**
   * 深度遍历源码 AST，定位裸 `writeStoredJson()` 调用。
   *
   * @param node - 当前 AST 节点。
   */
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'writeStoredJson'
      && !isHandledWriteStoredJsonCall(node)
    ) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      offenders.push(`${relativePath}:${line + 1}:${character + 1}`);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return offenders;
}

/**
 * 去掉表达式外层括号，便于识别 `(async () => {})()`。
 *
 * @param expression - 待规整的表达式。
 * @returns 去掉括号后的表达式。
 */
function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * 判断节点是否是 async 函数表达式或 async 箭头函数。
 *
 * @param node - 待检查表达式。
 * @returns 是否为 async IIFE 可调用主体。
 */
function isAsyncFunctionExpressionLike(node: ts.Expression): node is ts.ArrowFunction | ts.FunctionExpression {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
}

/**
 * 判断 async IIFE 主体内是否触碰 storage 相关 API。
 *
 * @param body - IIFE 函数体。
 * @returns 是否命中 storage 相关调用或对象。
 */
function asyncIifeBodyTouchesStorage(body: ts.ConciseBody): boolean {
  let found = false;

  /**
   * 深度遍历 IIFE body，发现 storage marker 后停止继续深入。
   *
   * @param node - 当前 AST 节点。
   */
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(node) && STORAGE_ASYNC_IIFE_MARKERS.has(node.text)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(body);
  return found;
}

/**
 * 收集 `void (async () => { ...storage... })()` 这类未消费 rejection 的调用。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 当前文件中的违规调用位置。
 */
function collectUnhandledStorageAsyncIifes(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];

  /**
   * 深度遍历源码 AST，定位被 `void` 丢弃且触碰 storage 的 async IIFE。
   *
   * @param node - 当前 AST 节点。
   */
  const visit = (node: ts.Node) => {
    if (
      ts.isVoidExpression(node)
      && ts.isCallExpression(node.expression)
    ) {
      const callee = unwrapParentheses(node.expression.expression);
      if (isAsyncFunctionExpressionLike(callee) && asyncIifeBodyTouchesStorage(callee.body)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        offenders.push(`${relativePath}:${line + 1}:${character + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return offenders;
}

describe('shared json config channel guard', () => {
  it('forbids new business modules from direct-importing guarded json-storage helpers', () => {
    const offenders = listRuntimeFiles()
      .map((relativePath) => ({
        relativePath,
        helpers: collectGuardedJsonStorageImports(relativePath),
      }))
      .filter(({ helpers }) => helpers.length > 0)
      .filter(({ relativePath }) => !ALLOWED_JSON_STORAGE_IMPORTS.has(relativePath))
      .map(({ relativePath, helpers }) => (
        `${relativePath}: 不允许 direct import ${helpers.join(', ')}，共享 JSON 配置请改走 createSharedJsonConfigChannel() 或域级 helper`
      ));

    expect(offenders).toEqual([]);
  });

  it('requires writeStoredJson callers to await or catch storage failures', () => {
    const offenders = listRuntimeFiles()
      .flatMap((relativePath) => collectUnhandledWriteStoredJsonCalls(relativePath))
      .map((location) => (
        `${location}: writeStoredJson() 必须 await，或接 .catch(...)；后台副作用请使用 writeStoredJsonInBackground()`
      ));

    expect(offenders).toEqual([]);
  });

  it('requires fire-and-forget async IIFEs that touch storage to consume rejection', () => {
    const offenders = listRuntimeFiles()
      .flatMap((relativePath) => collectUnhandledStorageAsyncIifes(relativePath))
      .map((location) => (
        `${location}: 触碰 storage 的 async IIFE 不能被 void 直接丢弃；请使用 consumeBackgroundStoragePromise() 或显式 .catch(...)`
      ));

    expect(offenders).toEqual([]);
  });
});
