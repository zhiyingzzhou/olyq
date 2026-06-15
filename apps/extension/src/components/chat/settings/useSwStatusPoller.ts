/**
 * 说明：`useSwStatusPoller` 设置页 Hook。
 *
 * 职责：
 * - 统一设置页对 `sw/status/get` UI Port 协议的轮询；
 * - 收口 Service Worker 状态 payload 的归一化；
 * - 避免性能页与 Service Worker 页分别维护 requestId、interval 与解析逻辑。
 *
 * 边界：
 * - 这里只处理设置页展示所需的轻量状态；
 * - 不承担聊天、图片、健康检查等长任务生命周期。
 */
import { useEffect, useMemo, useState } from 'react';

import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import { createId } from '@/lib/utils/id';

/** 设置页展示用 Service Worker 状态快照。 */
export interface SwStatusSnapshot {
  /** Service Worker 当前实例启动时间戳。 */
  startedAt: number;
  /** 最近一次 heartbeat alarm 触发时间戳。 */
  lastAlarmAt: number;
  /** 当前连接到后台的 UI Port 数量。 */
  uiPortCount: number;
  /** 当前是否存在 Offscreen Document。 */
  offscreenDoc: boolean;
  /** Offscreen Document 是否已经建立 Port 连接。 */
  offscreenPortConnected: boolean;
}

/** `useSwStatusPoller` 入参。 */
export interface UseSwStatusPollerOptions {
  /** 轮询间隔，单位毫秒。 */
  intervalMs?: number;
}

/** `useSwStatusPoller` 返回值。 */
export interface UseSwStatusPollerResult {
  /** 当前 UI Port 是否可用。 */
  portReady: boolean;
  /** 最近一次成功归一化后的状态快照。 */
  status: SwStatusSnapshot | null;
  /** 最近一次后台返回的错误摘要。 */
  error: string | null;
}

/** 默认 SW 状态轮询间隔。 */
const DEFAULT_SW_STATUS_INTERVAL_MS = 2000;

/**
 * 把后台 `sw/status` payload 规整成 UI 使用的稳定快照。
 *
 * @param payload - 后台回传的原始 payload。
 * @returns 规整后的状态快照。
 */
function normalizeSwStatusPayload(payload: Record<string, unknown>): SwStatusSnapshot {
  return {
    startedAt: typeof payload.startedAt === 'number' ? payload.startedAt : 0,
    lastAlarmAt: typeof payload.lastAlarmAt === 'number' ? payload.lastAlarmAt : 0,
    uiPortCount: typeof payload.uiPortCount === 'number' ? payload.uiPortCount : 0,
    offscreenDoc: typeof payload.offscreenDoc === 'boolean' ? payload.offscreenDoc : false,
    offscreenPortConnected: typeof payload.offscreenPortConnected === 'boolean' ? payload.offscreenPortConnected : false,
  };
}

/**
 * 轮询 Service Worker 状态。
 *
 * @param options - 轮询配置。
 * @returns UI Port 可用性、状态快照和错误摘要。
 */
export function useSwStatusPoller(options: UseSwStatusPollerOptions = {}): UseSwStatusPollerResult {
  const intervalMs = options.intervalMs ?? DEFAULT_SW_STATUS_INTERVAL_MS;
  const [status, setStatus] = useState<SwStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const portReady = useMemo(() => Boolean(getUiPort()), []);

  useEffect(() => {
    if (!portReady) return;

    let cleaned = false;
    const requestId = createId();
    const off = onUiPortMessage((msg) => {
      const message = msg as { type?: unknown; requestId?: unknown; payload?: unknown } | null;
      if (!message || message.requestId !== requestId || message.type !== 'sw/status') return;
      if (!message.payload || typeof message.payload !== 'object') return;

      const payload = message.payload as Record<string, unknown>;
      if (typeof payload.error === 'string' && payload.error.trim()) {
        setError(payload.error.trim());
        return;
      }
      setError(null);
      setStatus(normalizeSwStatusPayload(payload));
    });

    /**
     * 向后台发送一次状态查询。
     *
     * @remarks
     * Hook 卸载后立即停止发送，避免设置页切换标签时继续向已释放的订阅写入消息。
     */
    const tick = () => {
      if (cleaned) return;
      postUiPortMessage({ type: 'sw/status/get', requestId });
    };

    tick();
    const timer = window.setInterval(tick, Math.max(500, intervalMs));
    return () => {
      cleaned = true;
      off();
      window.clearInterval(timer);
    };
  }, [intervalMs, portReady]);

  return { portReady, status, error };
}
