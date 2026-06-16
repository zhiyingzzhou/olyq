/**
 * 说明：`code-scanning-security.guard` 安全扫描回归守卫。
 *
 * 职责：
 * - 防止 GitHub Code Scanning 已修复的高风险写法回流；
 * - 把弱随机、locale 安全合并、页面工具 URL 子串判断、敏感 bootstrap mirror 和表格 cell 局部转义沉成稳定 guard。
 *
 * 边界：
 * - 本文件只做源码静态扫描，不替代对应模块的行为测试；
 * - 新增例外必须先证明不会重新打开 CodeQL 告警或安全边界。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE_PATTERN = /(?:^|\.)(?:spec|test)\.tsx?$/;
const MARKDOWN_TABLE_PIPE_ESCAPE_PATTERN = /\.replace\(\s*\/\\\|\/g/;

/** 判断路径是否属于生产源码扫描范围。 */
function isProductionSourceFile(filePath: string): boolean {
  const relativePath = path.relative(SRC_ROOT, filePath);
  if (relativePath.startsWith(`refactor${path.sep}`)) return false;
  if (!SOURCE_EXTENSIONS.has(path.extname(filePath))) return false;
  return !TEST_FILE_PATTERN.test(path.basename(filePath));
}

/** 递归列出生产源码文件，用于守住跨模块安全 owner。 */
function listProductionSourceFiles(root = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('dist')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listProductionSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isProductionSourceFile(fullPath)) {
      out.push(path.relative(SRC_ROOT, fullPath));
    }
  }
  return out.sort();
}

/** 读取 src 下的源码文件。 */
function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('code scanning security guard', () => {
  it('安全 ID owner 不允许恢复 JS 弱随机', () => {
    const offenders = listProductionSourceFiles()
      .filter((file) => readSource(file).includes('Math.random'));
    expect(offenders).toEqual([]);
  });

  it('locale 合并只能复用安全 owner，不允许恢复本地 deepMerge', () => {
    const files = [
      'i18n/index.ts',
      'i18n/locale-audit.test.ts',
    ];

    const offenders = files.filter((file) => {
      const source = readSource(file);
      return !source.includes('safeDeepMergeLocaleResources')
        || /\bfunction\s+deepMerge\b/.test(source)
        || /target\[[^\]]+\]\s*=/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('页面工具不可采集页判断必须走 URL parser policy', () => {
    const files = [
      'lib/extension/page-tool-url-policy.ts',
      'plugins/sw/plugins/element-picker.ts',
      'plugins/page-tools/screenshot-capture/sw-plugin.ts',
    ];

    const offenders = files.filter((file) => {
      const source = readSource(file);
      return source.includes('.startsWith(')
        || source.includes('.includes(')
        || !source.includes('classifyPageToolTargetUrl');
    });

    expect(offenders).toEqual([]);
  });

  it('bootstrap mirror 必须按 Data Contract Registry 拒绝敏感 key', () => {
    const source = readSource('lib/storage/json-storage.ts');
    const registrySource = readSource('lib/data-contracts/registry.ts');
    const providerRotationSource = readSource('lib/ai/api-key-rotation-state.ts');

    expect(registrySource).toContain('BOOTSTRAP_MIRROR_SHARED_STORAGE_KEYS');
    expect(registrySource).toContain("bootstrapMirror: 'allowed'");
    expect(source).toContain('SHARED_STORAGE_CONTRACT_BY_KEY');
    expect(source).toContain('BOOTSTRAP_MIRROR_SHARED_STORAGE_KEYS');
    expect(source).toContain("contract.bootstrapMirror === 'allowed'");
    expect(source).toContain("contract.syncPolicy !== 'encrypted-secret'");
    expect(source).toContain('removeBootstrapMirror(storageKey)');
    expect(source).toContain('writeStoredJsonWithBootstrapMirror');
    expect(providerRotationSource).toContain('writeStoredJson(');
    expect(providerRotationSource).not.toContain('writeStoredJsonWithBootstrapMirror');
  });

  it('Markdown 表格 cell 只能通过共享 helper 转义', () => {
    const offenders = listProductionSourceFiles().filter((file) => {
      if (file === 'lib/utils/markdown-table.ts') return false;
      const source = readSource(file);
      return MARKDOWN_TABLE_PIPE_ESCAPE_PATTERN.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
