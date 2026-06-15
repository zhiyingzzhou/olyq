/**
 * 说明：`attachments.spec` 附件模块测试。
 *
 * 职责：
 * - 守住附件 Blob 校验对 offscreen / sidepanel 跨 Realm 的兼容性；
 * - 避免本地自动 full 快照因为 `instanceof Blob` 误判而显示“备份格式不支持”。
 */
import { describe, expect, it } from 'vitest';
import { toAttachmentMeta } from './attachments';
import { isI18nError } from './i18n/error';

describe('attachments', () => {
  it('附件元数据校验接受跨 Realm 形态的 Blob-like 数据', () => {
    const source = new Blob(['demo'], { type: 'text/plain' });
    const crossRealmBlobLike = {
      size: source.size,
      type: source.type,
      slice: source.slice.bind(source),
      arrayBuffer: source.arrayBuffer.bind(source),
    };

    expect(crossRealmBlobLike instanceof Blob).toBe(false);
    expect(toAttachmentMeta({
      id: 'att-cross-realm',
      kind: 'file',
      name: 'demo.txt',
      mime: 'text/plain',
      size: source.size,
      createdAt: 1,
      data: crossRealmBlobLike as Blob,
    })).toEqual({
      id: 'att-cross-realm',
      kind: 'file',
      name: 'demo.txt',
      mime: 'text/plain',
      size: source.size,
      createdAt: 1,
    });
  });

  it('附件 Blob 缺失时会携带稳定原因码', () => {
    try {
      toAttachmentMeta({
        id: 'att-missing-blob',
        kind: 'file',
        name: 'demo.txt',
        mime: 'text/plain',
        size: 4,
        createdAt: 1,
        data: { size: 4, type: 'text/plain' } as Blob,
      });
      throw new Error('expected to throw');
    } catch (error) {
      expect(isI18nError(error)).toBe(true);
      if (!isI18nError(error)) return;
      expect(error.i18n.key).toBe('errors.backupFormatUnsupported');
      expect(error.i18n.params).toEqual({
        detail: 'attachments.records.data.blob_like_missing',
      });
    }
  });
});
