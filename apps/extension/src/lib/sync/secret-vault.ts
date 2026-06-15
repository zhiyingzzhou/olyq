/**
 * 说明：structured sync 的 `Secret Domain v1` 加密模块。
 *
 * 职责：
 * - 用 Web Crypto 把模型 / Web Search 等敏感配置加密进远端 `secretVault`；
 * - 从当前 WebDAV / S3 连接配置派生同步加密材料，避免新增默认交互；
 * - 在解密失败时显式抛错，防止同步流程误把不可读 secret 当成空值覆盖本地。
 *
 * 边界：
 * - 本模块不读写 WebDAV/S3，也不接触 chrome storage；
 * - WebDAV/S3 自身连接凭据只用于派生本地加密材料，不会写入远端同步包；
 * - 当前协议固定为 v1，不实现 v2、旧 vault fallback 或多算法双轨。
 */
import type { EncryptedSyncSecretVault } from './diff-merge';
import type { HLCTimestamp } from './hlc';

/** Secret vault 的明文快照类型。 */
export type SyncSecretSnapshot = Record<string, unknown>;

const SECRET_VAULT_VERSION = 1;
const SECRET_VAULT_ALGORITHM = 'AES-GCM';
const SECRET_VAULT_KDF = 'PBKDF2-SHA256';
const SECRET_VAULT_ITERATIONS = 210_000;
const SECRET_VAULT_CONTEXT = 'olyq.sync.secret-vault.v1';

/** 可派生 secret vault 密钥的远端配置材料。 */
export type SyncSecretKeyMaterial =
  | {
      kind: 'webdav';
      url: string;
      path: string;
      username?: string;
      password?: string;
    }
  | {
      kind: 's3';
      endpoint: string;
      region: string;
      bucket: string;
      root: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

/**
 * 将字节数组编码为 base64。
 *
 * @param bytes - 原始字节。
 * @returns base64 字符串。
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(bytes.length, index + chunkSize));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * 将 base64 字符串解码为字节数组。
 *
 * @param value - base64 字符串。
 * @returns 解码后的字节。
 */
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * 复制 Uint8Array 到独立 ArrayBuffer。
 *
 * @param bytes - 原始字节视图。
 * @returns 独立 ArrayBuffer，避免把底层更大的 buffer 传给 Web Crypto。
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * 规整参与密钥派生的材料片段。
 *
 * @param value - 原始材料。
 * @returns trim 后字符串。
 */
function normalizeMaterialPart(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * 构建稳定的密钥派生材料字符串。
 *
 * @param material - WebDAV 或 S3 当前连接材料。
 * @returns 带 v1 context 的规范化材料。
 */
function buildMaterialString(material: SyncSecretKeyMaterial): string {
  if (material.kind === 'webdav') {
    return [
      SECRET_VAULT_CONTEXT,
      'webdav',
      normalizeMaterialPart(material.url).replace(/\/+$/, ''),
      normalizeMaterialPart(material.path) || '/olyq',
      normalizeMaterialPart(material.username),
      normalizeMaterialPart(material.password),
    ].join('\n');
  }

  return [
    SECRET_VAULT_CONTEXT,
    's3',
    normalizeMaterialPart(material.endpoint).replace(/\/+$/, ''),
    normalizeMaterialPart(material.region) || 'us-east-1',
    normalizeMaterialPart(material.bucket),
    normalizeMaterialPart(material.root) || 'olyq',
    normalizeMaterialPart(material.accessKeyId),
    normalizeMaterialPart(material.secretAccessKey),
  ].join('\n');
}

/**
 * 从远端连接材料派生 AES-GCM key。
 *
 * @param material - WebDAV 或 S3 当前连接材料。
 * @param salt - PBKDF2 salt。
 * @returns 可用于加密/解密 secretVault 的 CryptoKey。
 */
async function deriveVaultKey(material: SyncSecretKeyMaterial, salt: Uint8Array): Promise<CryptoKey> {
  const encodedMaterial = new TextEncoder().encode(buildMaterialString(material));
  const baseKey = await crypto.subtle.importKey('raw', encodedMaterial, 'PBKDF2', false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: SECRET_VAULT_ITERATIONS,
    },
    baseKey,
    { name: SECRET_VAULT_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 生成随机字节。
 *
 * @param length - 需要的字节长度。
 * @returns Web Crypto CSPRNG 生成的字节数组。
 */
function createRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * 判断 secret 快照是否含有实际字段。
 *
 * @param snapshot - secret 快照。
 * @returns 至少存在一个 key 时返回 `true`。
 */
function hasSecretPayload(snapshot: SyncSecretSnapshot): boolean {
  return Object.keys(snapshot).length > 0;
}

/**
 * 加密 secret 快照。
 *
 * @param snapshot - 已由 registry 提取出的敏感字段。
 * @param material - 当前 WebDAV / S3 连接配置派生材料。
 * @param meta - 写入 vault 的节点与 HLC 时间戳。
 * @returns 远端可保存的加密 vault；空 secret 返回 `undefined`。
 */
export async function encryptSyncSecretVault(
  snapshot: SyncSecretSnapshot,
  material: SyncSecretKeyMaterial,
  meta: { nodeId: string; updatedAt: HLCTimestamp },
): Promise<EncryptedSyncSecretVault | undefined> {
  if (!hasSecretPayload(snapshot)) return undefined;
  const salt = createRandomBytes(16);
  const iv = createRandomBytes(12);
  const key = await deriveVaultKey(material, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await crypto.subtle.encrypt({ name: SECRET_VAULT_ALGORITHM, iv: toArrayBuffer(iv) }, key, plaintext);

  return {
    version: SECRET_VAULT_VERSION,
    algorithm: SECRET_VAULT_ALGORITHM,
    kdf: SECRET_VAULT_KDF,
    iterations: SECRET_VAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nodeId: meta.nodeId,
    updatedAt: meta.updatedAt,
  };
}

/**
 * 解密远端 secret vault。
 *
 * @param vault - 远端状态里的加密 secret 包。
 * @param material - 当前 WebDAV / S3 连接配置派生材料。
 * @returns 解密后的 secret 快照；没有 vault 时返回空对象。
 */
export async function decryptSyncSecretVault(
  vault: EncryptedSyncSecretVault | undefined,
  material: SyncSecretKeyMaterial,
): Promise<SyncSecretSnapshot> {
  if (!vault) return {};
  if (
    vault.version !== SECRET_VAULT_VERSION
    || vault.algorithm !== SECRET_VAULT_ALGORITHM
    || vault.kdf !== SECRET_VAULT_KDF
    || vault.iterations !== SECRET_VAULT_ITERATIONS
  ) {
    throw new Error('unsupported sync secret vault');
  }

  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const ciphertext = base64ToBytes(vault.ciphertext);
  const key = await deriveVaultKey(material, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: SECRET_VAULT_ALGORITHM, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid sync secret vault payload');
  return parsed as SyncSecretSnapshot;
}
