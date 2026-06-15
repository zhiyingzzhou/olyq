/**
 * 说明：`s3-client.spec` 基础能力模块。
 *
 * 职责：
 * - 守住 S3 兼容错误响应的细节提取契约；
 * - 防止连接测试再次把标准 XML 错误压扁成“无法访问存储桶”。
 *
 * 边界：
 * - 本文件只验证错误细节拼装和公开 API 的失败语义，不覆盖真实签名正确性。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listObjects, testConnection, type S3Config } from './s3-client';

const CONFIG: S3Config = {
  endpoint: 'https://cos.example.com',
  region: 'ap-shanghai',
  bucket: 'openlist-1251530225',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  root: 'olyq',
};

describe('s3-client error detail', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('testConnection 会把腾讯云 COS 风格 XML 错误的 Code/Message/Resource/RequestId/TraceId 透传到 detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        `<?xml version='1.0' encoding='utf-8' ?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Resource>/openlist-1251530225</Resource>
  <RequestId>req-1</RequestId>
  <TraceId>trace-1</TraceId>
</Error>`,
        { status: 404, statusText: 'Not Found' },
      )),
    );

    await expect(testConnection(CONFIG)).rejects.toMatchObject({
      i18n: {
        key: 'errors.s3ConnectionFailedWithDetail',
        params: expect.objectContaining({
          status: 404,
          detail: expect.stringContaining('Code=NoSuchKey'),
        }),
      },
    });

    await testConnection(CONFIG).catch((error: unknown) => {
      expect(error).toMatchObject({
        i18n: {
          params: expect.objectContaining({
            detail: 'Code=NoSuchKey; Message=The specified key does not exist.; Resource=/openlist-1251530225; RequestId=req-1; TraceId=trace-1',
          }),
        },
      });
    });
  });

  it('listObjects 失败时会兼容 AWS S3 风格 HostId 并写入 detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied</Message>
  <Resource>/demo-bucket</Resource>
  <RequestId>aws-req-1</RequestId>
  <HostId>aws-host-1</HostId>
</Error>`,
        { status: 403, statusText: 'Forbidden' },
      )),
    );

    await expect(listObjects(CONFIG)).rejects.toMatchObject({
      i18n: {
        key: 'errors.s3ListFailedWithDetail',
        params: expect.objectContaining({
          status: 403,
          detail: 'Code=AccessDenied; Message=Access Denied; Resource=/demo-bucket; RequestId=aws-req-1; HostId=aws-host-1',
        }),
      },
    });
  });

  it('listObjects 会按 continuation token 拉完所有分页并保留对象元数据', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>page-2</NextContinuationToken>
  <Contents>
    <Key>olyq/olyq-backup-20260502033923108.zip</Key>
    <LastModified>2026-05-02T03:39:23.000Z</LastModified>
    <Size>158630</Size>
  </Contents>
</ListBucketResult>`, { status: 200 }))
      .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>olyq/olyq-backup-20260428150145183-lite.zip</Key>
    <LastModified>2026-04-28T15:01:45.000Z</LastModified>
    <Size>178120</Size>
  </Contents>
</ListBucketResult>`, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const objects = await listObjects(CONFIG, 'olyq/');

    expect(objects).toEqual([
      {
        key: 'olyq/olyq-backup-20260502033923108.zip',
        lastModified: '2026-05-02T03:39:23.000Z',
        size: 158630,
      },
      {
        key: 'olyq/olyq-backup-20260428150145183-lite.zip',
        lastModified: '2026-04-28T15:01:45.000Z',
        size: 178120,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('max-keys=1000');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('prefix=olyq%2F');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('continuation-token=page-2');
  });
});
