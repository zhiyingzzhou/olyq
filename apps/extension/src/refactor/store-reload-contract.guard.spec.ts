/**
 * 说明：`store-reload-contract.guard.spec` 源码模块。
 *
 * 职责：
 * - 禁止运行时代码继续裸监听 `olyq:store-reload`；
 * - 强制所有消费方统一走 `subscribeStoreReloadSignal` 这个唯一入口；
 * - 保留 `reload-signal.ts` 里的双通道 fanout 本身，不误伤广播基础设施。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_RUNTIME_FILES = new Set([
  'lib/storage/reload-signal.ts',
]);
const RAW_STORE_RELOAD_LISTENER_PATTERN = /\b(?:addEventListener|removeEventListener)\(\s*(?:['"]olyq:store-reload['"]|STORE_RELOAD_EVENT)\b/;

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
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

describe('store reload contract guard', () => {
  it('forbids new raw store-reload listeners outside reload-signal.ts', () => {
    const offenders = listRuntimeFiles()
      .filter((relativePath) => !ALLOWED_RUNTIME_FILES.has(relativePath))
      .filter((relativePath) => {
        const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
        return RAW_STORE_RELOAD_LISTENER_PATTERN.test(sourceText);
      })
      .map((relativePath) => `${relativePath}: 禁止裸监听 olyq:store-reload，请改走 subscribeStoreReloadSignal()`);

    expect(offenders).toEqual([]);
  });
});
