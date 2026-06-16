/**
 * 说明：`secure-id.test` 安全随机 ID 测试。
 *
 * 职责：
 * - 固化 ID 生成只能使用 Web Crypto；
 * - 防止后续恢复 JS 弱随机或时间戳弱随机回退。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSecureId } from './secure-id';

describe('secure-id', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('优先使用 crypto.randomUUID', () => {
    const randomUUID = vi.fn(() => 'uuid-from-web-crypto');
    vi.stubGlobal('crypto', {
      randomUUID,
      getRandomValues: vi.fn(),
    });

    expect(createSecureId()).toBe('uuid-from-web-crypto');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('randomUUID 不可用时使用 getRandomValues 生成十六进制 ID', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([0x00, 0x0f, 0x10, 0xff, 0xab, 0xcd, 0xef, 0x42, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
        return bytes;
      },
    });

    expect(createSecureId()).toBe('000f10ffabcdef421122334455667788');
  });

  it('缺少 Web Crypto 时直接失败，不降级到弱随机', () => {
    vi.stubGlobal('crypto', undefined);

    expect(() => createSecureId()).toThrow('secure random unavailable');
  });
});
