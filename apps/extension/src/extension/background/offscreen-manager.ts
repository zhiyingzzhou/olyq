/**
 * 说明：`offscreen-manager` 后台运行时模块。
 *
 * 职责：
 * - 承载 `offscreen-manager` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getOffscreenPort`、`setOffscreenPort`、`getOffscreenPending` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 离屏管理器— 离屏文档生命周期管理
 *
 * 负责：
 * - 创建/检测/关闭 Offscreen Document
 * - 通过 Port 向 Offscreen 发送 RPC 请求并等待响应
 * - 基于空闲时间自动关闭 Offscreen Document 以节省资源
 */

import { safePostMessage, uiPorts } from "./port-manager";
import { getStorageAdapter } from "../../lib/storage/storage-adapter";
import { I18nError } from "../../lib/i18n/error";
import {
  DEFAULT_OFFSCREEN_UNLOAD_CONFIG,
  OFFSCREEN_UNLOAD_CONFIG_KEY,
  normalizeOffscreenUnloadConfig,
  shouldRewriteOffscreenUnloadConfig,
  type OffscreenUnloadConfig,
} from "../../lib/extension/offscreen-unload-config";

/** 当前连接中的 offscreen Port；由 offscreen 页面连入后写入。 */
let offscreenPort: chrome.runtime.Port | null = null;

/** 单条挂起中的 Offscreen RPC 请求。 */
interface OffscreenPendingEntry {
  /** 成功回包时 resolve（把 offscreen 回传的 msg 原样透传） */
  resolve: (msg: unknown) => void;
  /** 超时/断线等异常时 reject */
  reject: (err: Error) => void;
  /** 超时定时器句柄（用于清理） */
  timer: number;
}

/**
 * Offscreen RPC 挂起请求表：requestId → 挂起条目。
 *
 * 约束：
 * - requestId 由调用方生成（必须唯一），用于在同一 Port 上实现“多路复用”。
 * - onMessage 收到回包后会根据 requestId 找到对应 entry 并 resolve。
 */
const offscreenPending = new Map<string, OffscreenPendingEntry>();

/** 上次被 callOffscreen 使用的时间戳（用于自动卸载 idle 判定） */
let offscreenLastUsedAt = Date.now();
/** 当前生效的离屏自动卸载配置缓存。 */
let offscreenUnloadConfig: OffscreenUnloadConfig = { ...DEFAULT_OFFSCREEN_UNLOAD_CONFIG };

// 严重-6 修复：用 inflight promise 去重，避免并发调用导致“只能存在一个 offscreen document”的错误。
/** 当前正在执行的 offscreen 创建流程；用于并发去重。 */
let offscreenInflight: Promise<void> | null = null;

// ─── Port 访问 ─────────────────────────────────────────────

/**
 * 读取当前 offscreen Port。
 *
 * 说明：
 * - 由 `service-worker.ts` 在 offscreen 页面建立连接后写入；
 * - 可能为 null（尚未连接/已断线）。
 */
export function getOffscreenPort(): chrome.runtime.Port | null {
  return offscreenPort;
}
/**
 * 写入/清空当前 offscreen Port。
 *
 * @param port - offscreen 侧连入的 Port；断线时传 null 以清理。
 */
export function setOffscreenPort(port: chrome.runtime.Port | null): void {
  offscreenPort = port;
}
/**
 * 读取挂起的 RPC 请求表（requestId -\> entry）。
 *
 * 说明：供 `service-worker.ts` 的 onMessage 回包逻辑使用。
 */
export function getOffscreenPending(): Map<string, OffscreenPendingEntry> {
  return offscreenPending;
}

// ─── 配置 ────────────────────────────────────────────────

/**
 * 加载离屏自动卸载配置。
 *
 * 说明：
 * - 配置来源于 storage，读取后会同步刷新模块内缓存；
 * - `idleTimeout` 会被强制收敛到 60~3600 秒，避免异常值导致频繁关闭或长期不释放资源。
 */
export async function loadOffscreenUnloadConfig(): Promise<OffscreenUnloadConfig> {
  const res = await getStorageAdapter().get([OFFSCREEN_UNLOAD_CONFIG_KEY]);
  const raw = res[OFFSCREEN_UNLOAD_CONFIG_KEY];
  const cfg = normalizeOffscreenUnloadConfig(raw);
  offscreenUnloadConfig = cfg;
  if (shouldRewriteOffscreenUnloadConfig(raw)) {
    await getStorageAdapter().set({ [OFFSCREEN_UNLOAD_CONFIG_KEY]: cfg });
  }
  return cfg;
}

/**
 * 获取离屏自动卸载配置的存储 key。
 *
 * 说明：供 UI 设置页展示/读写时复用，避免散落硬编码字符串。
 */
export function getOffscreenUnloadKey(): string {
  return OFFSCREEN_UNLOAD_CONFIG_KEY;
}

// ─── 生命周期 ─────────────────────────────────────────────

/**
 * 判断当前扩展是否已存在 Offscreen Document。
 *
 * 注意：该能力依赖浏览器对 MV3 offscreen 的支持；不支持时直接返回 false。
 */
export async function hasOffscreenDocument(): Promise<boolean> {
  if (!chrome.offscreen?.hasDocument) return false;
  return await new Promise<boolean>((resolve) => {
    chrome.offscreen.hasDocument((result) => resolve(Boolean(result)));
  });
}

/**
 * 确保 Offscreen Document 存在。
 *
 * 说明：
 * - Offscreen Document 是 MV3 提供的“有 DOM 的隐藏页面”，用于执行 SW 不具备的能力（如 DOMParser）。
 * - 并发创建会触发浏览器侧约束（同一扩展只允许存在一个 offscreen document），因此这里用 inflight 去重。
 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen?.createDocument) return;
  if (offscreenInflight) return offscreenInflight;

  offscreenInflight = (async () => {
    const hasDoc = await new Promise<boolean>((resolve) => {
      if (!chrome.offscreen?.hasDocument) return resolve(false);
      chrome.offscreen.hasDocument((result) => resolve(Boolean(result)));
    });
    if (hasDoc) return;

    await new Promise<void>((resolve, reject) => {
      chrome.offscreen.createDocument(
        {
          url: chrome.runtime.getURL("src/extension/offscreen/index.html"),
          reasons: [chrome.offscreen.Reason.DOM_PARSER],
          justification: "在离屏文档中执行 DOMParser/WebGPU 等任务（避免 SW 无 DOM/WebGPU 限制）。",
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            const detail = typeof err.message === 'string' ? err.message.trim() : '';
            reject(detail ? new I18nError('errors.offscreenCreateDocumentFailedWithDetail', { detail }, { cause: err }) : new I18nError('errors.offscreenCreateDocumentFailed', undefined, { cause: err }));
          }
          else resolve();
        },
      );
    });
  })().finally(() => { offscreenInflight = null; });

  return offscreenInflight;
}

/**
 * 等待 offscreen Port 就绪（有连接）。
 *
 * @param timeoutMs - 超时时间（毫秒）。超过则抛出可国际化错误。
 * @returns 已连接的 offscreen Port
 */
export async function waitForOffscreenPort(timeoutMs = 5000): Promise<chrome.runtime.Port> {
  const start = Date.now();
  while (!offscreenPort) {
    if (Date.now() - start > timeoutMs) throw new I18nError('errors.offscreenPortNotReady');
    await new Promise((r) => setTimeout(r, 80));
  }
  return offscreenPort;
}

// ─── 远程调用（RPC） ────────────────────────────────────────

/**
 * 向 offscreen 发送一条 RPC 请求并等待回包。
 *
 * 约束：
 * - msg.requestId 必须非空且唯一（用于多路复用）。
 * - 若超时则 reject，并从挂起表中清理该 requestId。
 */
export async function callOffscreen(
  msg: { type: string; requestId: string; payload?: unknown },
  timeoutMs = 60_000,
): Promise<unknown> {
  const port = offscreenPort;
  if (!port) throw new I18nError('errors.offscreenPortNotReady');
  const requestId = String(msg.requestId || "").trim();
  if (!requestId) throw new I18nError('errors.requestIdEmpty');

  // 每次 RPC 都刷新“最近活跃时间”，避免正在频繁使用时被自动卸载误杀。
  offscreenLastUsedAt = Date.now();
  return await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      offscreenPending.delete(requestId);
      reject(new I18nError('errors.offscreenResponseTimeout'));
    }, Math.max(1000, timeoutMs)) as unknown as number;
    // requestId 是唯一多路复用键；后续 onMessage 收到回包后会按这里的 entry resolve/reject。
    offscreenPending.set(requestId, { resolve, reject, timer });
    safePostMessage(port, msg);
  });
}

// ─── 自动关闭 ──────────────────────────────────────────────

/**
 * 根据“空闲 + 无 UI 连接 + 无挂起 RPC”的条件，尝试自动关闭 Offscreen Document。
 *
 * 说明：
 * - 该函数是“尽力而为”的资源优化，不应影响核心功能；
 * - 关闭前会再次确认 offscreen 是否存在，避免误报/竞态。
 */
export async function maybeAutoCloseOffscreen(_reason: string): Promise<void> {
  if (!offscreenUnloadConfig.autoUnload) return;
  if (offscreenPending.size > 0) return;
  if (uiPorts.size > 0) return;
  const idleMs = offscreenUnloadConfig.idleTimeout * 1000;
  if (Date.now() - offscreenLastUsedAt < idleMs) return;
  if (!chrome.offscreen?.closeDocument) return;
  const hasDoc = await hasOffscreenDocument().catch(() => false);
  if (!hasDoc) return;
  // 这里不等待 close 结果，也不抛错；自动卸载属于资源优化，不应反过来干扰主链路。
  chrome.offscreen.closeDocument(() => {
    void chrome.runtime.lastError;
  });
}
