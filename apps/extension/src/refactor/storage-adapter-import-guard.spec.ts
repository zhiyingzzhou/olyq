/**
 * 说明：`storage-adapter-import-guard.spec` 源码模块。
 *
 * 职责：
 * - 把 `getStorageAdapter` 限制在少量低层 infra / sync / backup 例外内；
 * - 防止普通业务模块重新直连 raw KV，绕开 `json-storage` / `patchStorageObject` / `storage-engine`；
 * - 把当前遗留例外显式列成 allowlist，便于后续继续收缩。
 *
 * 边界：
 * - 这里只检查运行时代码中的 import，不覆盖测试文件；
 * - 例外名单是当前已审计的遗留边界，不代表鼓励继续扩张。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE_ADAPTER_IMPORT_MARKERS = new Set([
  '@/lib/storage/storage-adapter',
  './storage-adapter',
  '../storage/storage-adapter',
]);

/**
 * 当前允许 direct import `storage-adapter` 的遗留例外。
 *
 * 说明：
 * - 主要保留低层基础设施、backup/restore、sync 和少量尚未迁移的历史模块；
 * - 新业务模块默认不应再进入这份名单。
 */
const ALLOWED_STORAGE_ADAPTER_IMPORTS = new Set([
  'components/chat/chat-input/useChatInputIntegrationState.ts',
  'extension/background/backup-scheduler.ts',
  'extension/background/mcp-chat-tools.ts',
  'extension/background/mcp-session-pool.ts',
  'extension/background/offscreen-manager.ts',
  'extension/background/service-worker.ts',
  'extension/offscreen/runtime.ts',
  'hooks/useModelOptions.ts',
  'hooks/usePinnedModels.ts',
  'lib/ai/lobe-icon-list.ts',
  'lib/ai/model-registry/storage-lite.ts',
  'lib/ai/model-registry/storage.ts',
  'lib/ai/provider-read-fast.ts',
  'lib/ai/provider-registry.ts',
  'lib/backup-archive.ts',
  'lib/extension/extension-page-startup.ts',
  'lib/mcp/storage.ts',
  'lib/mcp/oauth-cache.ts',
  'lib/persistence/storage-engine.ts',
  'lib/storage/json-storage.ts',
  'lib/storage/storage-adapter.ts',
  'lib/sync/cloud-sync.ts',
  'lib/sync/sync-engine.ts',
]);

/**
 * 递归列出 `src` 下所有运行时代码文件。
 *
 * @param relativeDirectory - 相对 `src` 根目录的子目录。
 * @returns 当前目录及其子目录下所有非测试 `.ts/.tsx` 文件。
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
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 判断某个 import 是否指向 `storage-adapter`。
 *
 * @param importText - import 源文本。
 * @returns 是否命中 `storage-adapter`。
 */
function isStorageAdapterImport(importText: string): boolean {
  const normalized = String(importText || '').trim();
  if (STORAGE_ADAPTER_IMPORT_MARKERS.has(normalized)) return true;
  return normalized.endsWith('/storage-adapter');
}

/**
 * 判断文件是否 direct import 了 `storage-adapter`。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 是否命中 import。
 */
function importsStorageAdapter(relativePath: string): boolean {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  let found = false;

  /**
   * 深度遍历 AST，判断是否存在 `storage-adapter` import。
   *
   * @param node - 当前 AST 节点。
   */
  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && isStorageAdapterImport(node.moduleSpecifier.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

/**
 * 判断表达式是否是 `getStorageAdapter().get/set/remove(...)`。
 *
 * @param node - 待检查的调用表达式。
 * @returns 是否命中 raw storage adapter 读写调用。
 */
function isRawStorageAdapterOperation(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!['get', 'set', 'remove'].includes(node.expression.name.text)) return false;
  const receiver = node.expression.expression;
  return ts.isCallExpression(receiver)
    && ts.isIdentifier(receiver.expression)
    && receiver.expression.text === 'getStorageAdapter';
}

/**
 * 收集 `void getStorageAdapter().get/set/remove(...)` 这类未消费 rejection 的调用。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 违规调用位置列表。
 */
function collectUnhandledRawStorageVoidCalls(relativePath: string): string[] {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];

  /**
   * 深度遍历 AST，定位被 `void` 直接丢弃的 raw storage Promise。
   *
   * @param node - 当前 AST 节点。
   */
  function visit(node: ts.Node): void {
    if (
      ts.isVoidExpression(node)
      && ts.isCallExpression(node.expression)
      && isRawStorageAdapterOperation(node.expression)
    ) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      offenders.push(`${relativePath}:${line + 1}:${character + 1}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offenders;
}

describe('storage adapter import guard', () => {
  it('forbids new business modules from direct-importing storage-adapter', () => {
    const offenders = listRuntimeFiles()
      .filter(importsStorageAdapter)
      .filter((relativePath) => !ALLOWED_STORAGE_ADAPTER_IMPORTS.has(relativePath))
      .map((relativePath) => `${relativePath}: 不允许 direct import storage-adapter，请改走 json-storage / patchStorageObject / storage-engine`);

    expect(offenders).toEqual([]);
  });

  it('requires fire-and-forget raw storage operations to consume rejection', () => {
    const offenders = listRuntimeFiles()
      .flatMap((relativePath) => collectUnhandledRawStorageVoidCalls(relativePath))
      .map((location) => (
        `${location}: raw storage Promise 不能被 void 直接丢弃；后台副作用请使用 consumeBackgroundStoragePromise()`
      ));

    expect(offenders).toEqual([]);
  });
});
