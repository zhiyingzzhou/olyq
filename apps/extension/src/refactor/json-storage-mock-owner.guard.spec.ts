/**
 * 说明：`json-storage-mock-owner.guard` 测试替身 owner 守卫。
 *
 * 职责：
 * - 防止 spec 继续手写 `json-storage` 的不完整 `vi.mock` 模块形状；
 * - 强制所有 `json-storage` 测试替身统一走 `src/test/json-storage-mock.ts`；
 * - 避免生产 storage API 新增后只在 CI 全量测试里暴露缺 mock export。
 *
 * 边界：
 * - 本文件只扫描测试源码，不约束生产代码的 storage owner；
 * - 如需新增 storage mock 能力，应扩展 `json-storage-mock.ts`，不要在单个 spec 里局部补丁。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_FILE_PATTERN = /\.(?:spec|test)\.tsx?$/;
const JSON_STORAGE_MOCK_CALL_PATTERN = /vi\.mock\(\s*['"](?:@\/lib\/storage\/json-storage|\.\/json-storage)['"]/g;
const JSON_STORAGE_HANDWRITTEN_FACTORY_PATTERN = /=>\s*\(\s*\{\s*(?:readBootstrapStoredJsonSeed|readStoredJson|writeStoredJson|subscribeStoredKeys)\s*:/s;

/**
 * 递归列出 `src` 下所有测试文件。
 *
 * @param root - 当前扫描目录。
 * @returns 相对 `src` 根目录的测试文件路径。
 */
function listTestFiles(root = SRC_ROOT): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listTestFiles(fullPath);
    if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) return [];
    return [path.relative(SRC_ROOT, fullPath)];
  }).sort();
}

/**
 * 读取 `src` 下的测试源码。
 *
 * @param relativePath - 相对 `src` 根目录的文件路径。
 * @returns 文件源码文本。
 */
function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('json-storage mock owner guard', () => {
  it('测试文件 mock json-storage 时必须复用统一 mock owner', () => {
    const offenders = listTestFiles().filter((file) => {
      const source = readSource(file);
      if (!JSON_STORAGE_MOCK_CALL_PATTERN.test(source)) return false;
      JSON_STORAGE_MOCK_CALL_PATTERN.lastIndex = 0;
      return !source.includes('@/test/json-storage-mock')
        || !source.includes('createJsonStorageMockModule')
        || JSON_STORAGE_HANDWRITTEN_FACTORY_PATTERN.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
