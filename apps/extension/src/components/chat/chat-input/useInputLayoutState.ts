/**
 * 说明：`useInputLayoutState` 组件模块。
 *
 * 职责：
 * - 承载 `useInputLayoutState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useInputLayoutState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  readBootstrapStoredJsonSeed,
  readStoredJsonWithBootstrapMirror,
  subscribeStoredKeys,
  writeStoredJsonWithBootstrapMirrorInBackground,
} from '@/lib/storage/json-storage';

const COMPOSER_SHELL_HEIGHT_KEY = 'olyq.chat.composer-shell-height.v1';
const COMPOSER_SHELL_HEIGHT_DEFAULT = 124;
const COMPOSER_SHELL_HEIGHT_MIN = 104;
const COMPOSER_SHELL_HEIGHT_MAX = 560;

/**
 * 内部函数：`normalizeInputHeight`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeComposerShellHeight(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(value) && value > 0) {
    return Math.max(COMPOSER_SHELL_HEIGHT_MIN, Math.min(COMPOSER_SHELL_HEIGHT_MAX, value));
  }
  return COMPOSER_SHELL_HEIGHT_DEFAULT;
}

let composerShellHeightCache = readBootstrapStoredJsonSeed(
  COMPOSER_SHELL_HEIGHT_KEY,
  COMPOSER_SHELL_HEIGHT_DEFAULT,
  normalizeComposerShellHeight,
);

/**
 * 内部函数：`refreshInputLayoutFromStorage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function refreshInputLayoutFromStorage(): Promise<{
  composerShellHeight: number;
}> {
  const composerShellHeight = await readStoredJsonWithBootstrapMirror(COMPOSER_SHELL_HEIGHT_KEY, composerShellHeightCache, normalizeComposerShellHeight);
  composerShellHeightCache = composerShellHeight;
  return { composerShellHeight };
}

/**
 * 导出 Hook：`useInputLayoutState`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useInputLayoutState() {
  /** 输入区 composer shell 的最小高度，持久化到统一存储层并通过 bootstrap mirror 保留冷启动体验。 */
  const [composerShellHeight, setComposerShellHeight] = useState(() => composerShellHeightCache);

  useEffect(() => {
    let active = true;

        /**
     * 内部函数变量：`apply`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const apply = async () => {
      const next = await refreshInputLayoutFromStorage();
      if (!active) return;
      setComposerShellHeight(next.composerShellHeight);
    };

    void apply();
    const unsubscribe = subscribeStoredKeys([COMPOSER_SHELL_HEIGHT_KEY], () => {
      void apply();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /** 持久化输入区 shell 高度。 */
  const persistComposerShellHeight = useCallback((height: number) => {
    const next = normalizeComposerShellHeight(height);
    composerShellHeightCache = next;
    writeStoredJsonWithBootstrapMirrorInBackground(COMPOSER_SHELL_HEIGHT_KEY, next, 'useInputLayoutState.composerShellHeight');
  }, []);

  /**
   * 开始拖拽调整输入区 shell 高度。
   *
   * 说明：
   * - 只响应鼠标左键；
   * - 拖拽过程中只更新内存状态，结束时再一次性写入 localStorage。
   */
  const startResize = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = composerShellHeight;
    let lastHeight = startHeight;

        /**
     * 内部函数变量：`onMove`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const next = Math.max(COMPOSER_SHELL_HEIGHT_MIN, Math.min(COMPOSER_SHELL_HEIGHT_MAX, startHeight - delta));
      lastHeight = next;
      setComposerShellHeight(next);
    };

        /**
     * 内部函数变量：`onUp`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      persistComposerShellHeight(lastHeight);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  }, [composerShellHeight, persistComposerShellHeight]);

  return {
    composerShellHeight,
    startResize,
  };
}
