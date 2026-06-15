/**
 * 说明：`runtime` 源码模块。
 *
 * 职责：
 * - 承载 `runtime` 相关的当前文件实现与模块边界；
 * - 对外暴露 `E2EBrowserTarget`、`resolveExtensionDistDir`、`resolveHeadlessMode` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** 导出类型：`E2EBrowserTarget`。 */
export type E2EBrowserTarget = 'chromium' | 'firefox';

/** 导出类型：`ForegroundAppSnapshot`。 */
export type ForegroundAppSnapshot = {
  /** 启动扩展 E2E 前位于前台的应用名。 */
  readonly appName: string;
};

type ResolveExtensionDistOptions = {
  browser?: E2EBrowserTarget;
  preferTestBuild?: boolean;
};

/**
 * 测试辅助函数：`buildDistCandidates`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function buildDistCandidates(browser: E2EBrowserTarget, preferTestBuild: boolean) {
  if (browser === 'firefox') {
    return preferTestBuild
      ? ['dist-firefox-e2e', 'dist-firefox']
      : ['dist-firefox', 'dist-firefox-e2e'];
  }

  return preferTestBuild
    ? ['dist-e2e', 'dist']
    : ['dist', 'dist-e2e'];
}

/**
 * 测试辅助函数：`shouldRestoreForegroundApp`。
 *
 * @remarks
 * mock E2E 默认尽量不抢本机前台焦点；
 * 当前只在 macOS 生效，若开发者明确想看浏览器窗口，可设置 `PW_EXTENSION_ALLOW_FOCUS=1` 关闭该行为。
 */
function shouldRestoreForegroundApp() {
  return process.platform === 'darwin' && process.env.PW_EXTENSION_ALLOW_FOCUS !== '1';
}

/**
 * 测试辅助函数：`runAppleScript`。
 *
 * @remarks
 * 对 macOS 的 `osascript` 做轻量封装；若当前环境不支持或执行失败，直接降级为空字符串。
 */
function runAppleScript(script: string) {
  try {
    return execFileSync('osascript', ['-e', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 测试辅助函数：`toAppleScriptString`。
 *
 * @remarks
 * 只负责把普通字符串安全嵌进 AppleScript 双引号字面量，避免应用名中包含引号时脚本失效。
 */
function toAppleScriptString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * 导出函数：`resolveExtensionDistDir`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function resolveExtensionDistDir(options: ResolveExtensionDistOptions = {}) {
  const browser = options.browser ?? 'chromium';
  const preferTestBuild = options.preferTestBuild ?? true;
  const candidates = [
    process.env.OLYQ_EXTENSION_DIST,
    ...buildDistCandidates(browser, preferTestBuild),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    const abs = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(abs)) continue;
    if (!fs.existsSync(path.join(abs, 'manifest.json'))) continue;
    return abs;
  }

  throw new Error(`找不到扩展构建产物目录：已尝试 ${candidates.join(', ')}`);
}

/**
 * 导出函数：`resolveHeadlessMode`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function resolveHeadlessMode() {
  return process.env.PW_HEADLESS === '1';
}

/**
 * 导出函数：`captureForegroundApp`。
 *
 * @remarks
 * 在扩展 E2E 启动前记录当前前台应用，便于浏览器窗口打开后把焦点还给原应用；
 * 仅作为本地开发体验优化，不参与业务断言。
 */
export function captureForegroundApp(): ForegroundAppSnapshot | null {
  if (!shouldRestoreForegroundApp()) return null;
  const appName = runAppleScript('tell application "System Events" to get name of first application process whose frontmost is true');
  return appName ? { appName } : null;
}

/**
 * 导出函数：`restoreForegroundApp`。
 *
 * @remarks
 * 若当前环境启用了“保持前台应用”优化，就在扩展窗口拉起后把焦点切回启动测试前的应用；
 * 失败时静默降级，不影响测试本身。
 */
export function restoreForegroundApp(snapshot: ForegroundAppSnapshot | null) {
  if (!snapshot?.appName || !shouldRestoreForegroundApp()) return;
  runAppleScript(`tell application ${toAppleScriptString(snapshot.appName)} to activate`);
}

/**
 * 导出函数：`parseExtensionIdFromUrl`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function parseExtensionIdFromUrl(url: string) {
  const match = /^chrome-extension:\/\/([^/]+)\//.exec(url);
  return match?.[1] ?? '';
}
