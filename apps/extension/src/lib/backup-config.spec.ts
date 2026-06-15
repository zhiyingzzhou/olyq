/**
 * 说明：`backup-config.spec` 备份模块。
 *
 * 职责：
 * - 承载 `backup-config.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import {
  BACKUP_MIME_TYPE,
  buildTimestampedBackupFileName,
  DEFAULT_BACKUP_FILENAME,
  isBackupArchiveName,
  isBackupFilePath,
  normalizeBackupFileName,
} from './backup-config';

describe('backup-config', () => {
  it('normalizes backup file names to the zip extension', () => {
    expect(normalizeBackupFileName('')).toBe(DEFAULT_BACKUP_FILENAME);
    expect(normalizeBackupFileName('manual-export')).toBe('manual-export.zip');
    expect(normalizeBackupFileName('manual-export.zip')).toBe('manual-export.zip');
  });

  it('treats only zip paths and archive names as backup targets', () => {
    expect(isBackupFilePath('/exports/olyq-backup.zip')).toBe(true);
    expect(isBackupFilePath('/exports/olyq-backup.json')).toBe(false);
    expect(isBackupArchiveName('olyq-backup-20260319112233456.zip')).toBe(true);
    expect(isBackupArchiveName('olyq-backup-20260319112233456-lite.zip')).toBe(true);
    expect(isBackupArchiveName('manual-olyq-backup-20260319112233456.zip')).toBe(false);
    expect(isBackupArchiveName('olyq-backup.zip')).toBe(false);
    expect(isBackupArchiveName('olyq-backup-20260319.json')).toBe(false);
  });

  it('builds timestamped zip backup names with millisecond precision', () => {
    expect(
      buildTimestampedBackupFileName({
        profile: 'lite',
        date: new Date(2026, 2, 19, 11, 22, 33, 456),
      }),
    ).toBe('olyq-backup-20260319112233456-lite.zip');
    expect(BACKUP_MIME_TYPE).toBe('application/zip');
  });
});
