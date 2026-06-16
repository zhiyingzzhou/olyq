/**
 * 说明：`secure-id` 安全随机 ID 模块。
 *
 * 职责：
 * - 为扩展内临时会话、实体 ID 和跨运行时引用生成不可预测 ID；
 * - 统一拒绝 JS 弱随机回退，避免安全扫描和真实会话边界漂移。
 *
 * 边界：
 * - 本模块只依赖 Web Crypto，不读取 storage，也不访问浏览器扩展 API；
 * - 当前扩展运行基线必须提供 Web Crypto。缺失时直接失败，调用方不得降级到弱随机。
 */

/** 安全随机 ID 生成失败时抛出的稳定错误信息。 */
const SECURE_RANDOM_UNAVAILABLE_ERROR = 'secure random unavailable';

/** 16 字节随机数的十六进制表，作为 `randomUUID()` 不可用时的同强度备用格式。 */
const HEX_ALPHABET = '0123456789abcdef';

/**
 * 生成安全随机 ID。
 *
 * @remarks
 * 优先使用浏览器原生 `crypto.randomUUID()`；旧运行时若只有
 * `crypto.getRandomValues()`，则生成 128-bit 十六进制随机串。两条路径都
 * 来自 Web Crypto，不保留弱随机或时间戳混合回退。
 *
 * @returns 安全随机 ID 字符串。
 * @throws 当前运行时缺少 Web Crypto 随机能力时抛出错误。
 */
export function createSecureId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    let out = '';
    for (const byte of bytes) {
      out += HEX_ALPHABET[byte >> 4] + HEX_ALPHABET[byte & 0x0f];
    }
    return out;
  }
  throw new Error(SECURE_RANDOM_UNAVAILABLE_ERROR);
}
