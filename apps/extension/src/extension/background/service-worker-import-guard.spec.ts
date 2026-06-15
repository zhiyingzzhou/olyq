/**
 * 说明：`service-worker-import-guard.spec` 后台运行时模块。
 *
 * 职责：
 * - 承载 `service-worker-import-guard.spec` 相关的当前文件实现与模块边界；
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
const SRC_ROOT = path.resolve(THIS_DIR, '../../..');
const SERVICE_WORKER_ENTRY = path.resolve(THIS_DIR, 'service-worker.ts');
const EXTENSION_API_GLOBAL_SPECIFIER = './extension-api-global';
const SERIALIZED_EXECUTE_SCRIPT_IMPORT_ALLOWLIST = new Set(['importContentScriptMainBundleForPageTool']);
const RECEIVER_SENSITIVE_CHROME_METHODS = new Set(['open', 'setOptions', 'setPanelBehavior', 'executeScript']);

/**
 * 测试辅助函数：`tryResolveSourceModule`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
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

/**
 * 测试辅助函数：`listServiceWorkerReachableFiles`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function listServiceWorkerReachableFiles(entryFile: string): string[] {
  const queue = [entryFile];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const filePath = queue.pop()!;
    if (visited.has(filePath)) continue;
    visited.add(filePath);

    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (statement.importClause?.isTypeOnly) continue;
        const specifier = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
        if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
        const resolved = tryResolveSourceModule(filePath, specifier);
        if (resolved) queue.push(resolved);
        continue;
      }

      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const specifier = statement.moduleSpecifier.text;
        if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
        const resolved = tryResolveSourceModule(filePath, specifier);
        if (resolved) queue.push(resolved);
      }
    }
  }

  return [...visited].sort();
}

/**
 * 测试辅助函数：`findDynamicImportOffsets`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function findDynamicImportOffsets(filePath: string): number[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const offsets: number[] = [];

  /**
   * 测试辅助函数：`visit`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (!isAllowedSerializedExecuteScriptImport(node)) offsets.push(node.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offsets;
}

/**
 * 测试辅助函数：`isAllowedSerializedExecuteScriptImport`。
 *
 * @remarks
 * 只允许 `chrome.scripting.executeScript({ func })` 需要序列化到目标页面 isolated world 的
 * 单一补注入函数包含动态 import。该函数不在 Service Worker 内调用；普通后台可达代码中的
 * `import()` 仍会被本 guard 拦截。
 */
function isAllowedSerializedExecuteScriptImport(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) {
      const name = current.name?.text;
      return Boolean(name && SERIALIZED_EXECUTE_SCRIPT_IMPORT_ALLOWLIST.has(name));
    }
    current = current.parent;
  }
  return false;
}

/**
 * 判断一个表达式是否从浏览器 Event 对象上取出了 `addListener` 方法。
 *
 * @remarks
 * Chrome Extension 的 Event 方法依赖 receiver。`event.addListener(...)` 合法，
 * 但 `const addListener = event.addListener; addListener(...)` 会在真实浏览器中抛
 * `Illegal invocation`，进而中断 Service Worker 注册。
 */
function isDetachedAddListenerInitializer(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'addListener';
}

/**
 * 查找 Service Worker 可达代码中的 detached Event.addListener 写法。
 *
 * @param filePath - 待扫描源码文件。
 * @returns 违规位置 offset 列表。
 */
function findDetachedChromeEventAddListenerOffsets(filePath: string): number[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const detachedNames = new Set<string>();
  const offsets = new Set<number>();

  /**
   * 测试辅助函数：`visit`。
   *
   * @remarks
   * 同时记录 detached binding 和它的裸调用；任一出现都说明运行时存在 receiver 丢失风险。
   */
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && isDetachedAddListenerInitializer(node.initializer)
    ) {
      detachedNames.add(node.name.text);
      offsets.add(node.name.getStart(sourceFile));
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && detachedNames.has(node.expression.text)) {
      offsets.add(node.expression.getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...offsets].sort((a, b) => a - b);
}

/**
 * 判断是否从 receiver-sensitive 的 Chrome API 对象上拆出了方法。
 *
 * @remarks
 * `chrome.sidePanel.open/setOptions/setPanelBehavior` 与 `chrome.scripting.executeScript`
 * 在真实 Chrome 中也依赖调用 receiver。允许 `chrome.sidePanel.open(...)` 这类成员调用，
 * 禁止 `const open = chrome.sidePanel.open; open(...)` 这类 detached 调用形态。
 */
function isDetachedReceiverSensitiveChromeMethodInitializer(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isPropertyAccessExpression(node)) return false;
  if (!RECEIVER_SENSITIVE_CHROME_METHODS.has(node.name.text)) return false;
  const text = node.getText(sourceFile);
  return /\b(?:chrome|sidePanel|scripting)\b/.test(text);
}

/**
 * 查找 Service Worker 可达代码中的 detached Chrome API 方法写法。
 *
 * @param filePath - 待扫描源码文件。
 * @returns 违规位置 offset 列表。
 */
function findDetachedReceiverSensitiveChromeMethodOffsets(filePath: string): number[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const detachedNames = new Set<string>();
  const offsets = new Set<number>();

  /**
   * 测试辅助函数：`visit`。
   *
   * @remarks
   * 同时记录 detached binding 和裸调用；只要进入该形态，真实浏览器里就可能丢失 receiver。
   */
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && isDetachedReceiverSensitiveChromeMethodInitializer(node.initializer, sourceFile)
    ) {
      detachedNames.add(node.name.text);
      offsets.add(node.name.getStart(sourceFile));
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && detachedNames.has(node.expression.text)) {
      offsets.add(node.expression.getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...offsets].sort((a, b) => a - b);
}

/**
 * 查找是否重新引入 Chromium toolbar action 的手写 owner。
 *
 * @remarks
 * Chromium 扩展图标打开 Side Panel 的主路径只能由
 * `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` 接管。
 * 手写 Chromium `action.onClicked -> sidePanel.open` 会重新落入用户手势窗口风险。
 */
function findForbiddenChromiumToolbarActionOwnerOffsets(filePath: string): number[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const offsets = new Set<number>();

  /**
   * 测试辅助函数：`visit`。
   *
   * @remarks
   * 同时拦截旧 helper 名称和显式关闭浏览器 action 默认打开 Side Panel 的配置。
   */
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === 'installChromiumActionClickHandler') {
      offsets.add(node.getStart(sourceFile));
    }

    if (
      ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'openPanelOnActionClick'
      && node.initializer.kind === ts.SyntaxKind.FalseKeyword
    ) {
      offsets.add(node.name.getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...offsets].sort((a, b) => a - b);
}

describe('service worker runtime import guard', () => {
  it('service worker 必须最先执行后台扩展 API 命名空间 bootstrap', () => {
    const sourceText = fs.readFileSync(SERVICE_WORKER_ENTRY, 'utf8');
    const sourceFile = ts.createSourceFile(SERVICE_WORKER_ENTRY, sourceText, ts.ScriptTarget.Latest, true);
    const firstImport = sourceFile.statements.find(ts.isImportDeclaration);
    const firstSpecifier = firstImport && ts.isStringLiteral(firstImport.moduleSpecifier)
      ? firstImport.moduleSpecifier.text
      : null;

    expect(firstSpecifier).toBe(EXTENSION_API_GLOBAL_SPECIFIER);
  });

  it('service worker 可达运行时代码不应使用动态 import()', () => {
    const offenders = listServiceWorkerReachableFiles(SERVICE_WORKER_ENTRY)
      .map((filePath) => ({ filePath, offsets: findDynamicImportOffsets(filePath) }))
      .filter((entry) => entry.offsets.length > 0)
      .map((entry) => ({
        filePath: path.relative(SRC_ROOT, entry.filePath),
        offsets: entry.offsets,
      }));

    expect(offenders).toEqual([]);
  });

  it('service worker 可达运行时代码不得 detached 调用 Chrome Event.addListener', () => {
    const offenders = listServiceWorkerReachableFiles(SERVICE_WORKER_ENTRY)
      .map((filePath) => ({ filePath, offsets: findDetachedChromeEventAddListenerOffsets(filePath) }))
      .filter((entry) => entry.offsets.length > 0)
      .map((entry) => ({
        filePath: path.relative(SRC_ROOT, entry.filePath),
        offsets: entry.offsets,
      }));

    expect(offenders).toEqual([]);
  });

  it('service worker 可达运行时代码不得 detached 调用 receiver-sensitive Chrome API 方法', () => {
    const offenders = listServiceWorkerReachableFiles(SERVICE_WORKER_ENTRY)
      .map((filePath) => ({ filePath, offsets: findDetachedReceiverSensitiveChromeMethodOffsets(filePath) }))
      .filter((entry) => entry.offsets.length > 0)
      .map((entry) => ({
        filePath: path.relative(SRC_ROOT, entry.filePath),
        offsets: entry.offsets,
      }));

    expect(offenders).toEqual([]);
  });

  it('Chromium toolbar action 不应回到手写 action click owner', () => {
    const offenders = listServiceWorkerReachableFiles(SERVICE_WORKER_ENTRY)
      .map((filePath) => ({ filePath, offsets: findForbiddenChromiumToolbarActionOwnerOffsets(filePath) }))
      .filter((entry) => entry.offsets.length > 0)
      .map((entry) => ({
        filePath: path.relative(SRC_ROOT, entry.filePath),
        offsets: entry.offsets,
      }));

    expect(offenders).toEqual([]);
  });
});
