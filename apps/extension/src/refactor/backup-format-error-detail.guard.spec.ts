/**
 * 说明：`backup-format-error-detail.guard` 备份错误诊断守卫。
 *
 * 职责：
 * - 防止“备份格式不支持”再次退化成只有 i18n key、没有稳定原因码的状态；
 * - 约束运行时代码必须通过带 `detail` 的构造路径写入可诊断错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 递归列出源码文件。 */
function listSourceFiles(relativeDirectory = ''): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
    const absolutePath = path.join(SRC_ROOT, relativePath);
    if (entry.isDirectory()) return listSourceFiles(relativePath);
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

describe('backup format error detail guard', () => {
  it('requires unsupported backup format errors to carry a reason code', () => {
    const offenders: string[] = [];
    for (const relativePath of listSourceFiles()) {
      const source = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
      if (/createBackupFormatError\(\s*\)/.test(source)) {
        offenders.push(`${relativePath}: createBackupFormatError() missing detail`);
      }
      if (/new I18nError\(\s*['"]errors\.backupFormatUnsupported['"]\s*\)/.test(source)) {
        offenders.push(`${relativePath}: backupFormatUnsupported missing params.detail`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not allow backup archive appVersion to read runtime manifest', () => {
    const source = fs.readFileSync(path.join(SRC_ROOT, 'lib/backup-archive.ts'), 'utf8');

    expect(source).not.toMatch(/chrome\.runtime\.getManifest/);
    expect(source).not.toMatch(/runtime\.getManifest/);
  });
});
