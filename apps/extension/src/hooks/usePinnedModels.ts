/**
 * 说明：`usePinnedModels` Hook 模块。
 *
 * 职责：
 * - 承载 `usePinnedModels` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UsePinnedModelsResult`、`usePinnedModels` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PINNED_MODELS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import {
  consumeBackgroundStoragePromise,
  reportBackgroundStorageFailure,
} from '@/lib/storage/background-storage';

/**
 * "置顶模型"是纯 UI 概念：
 * - 仅用于在"选择模型"弹窗里把常用模型放到列表顶部
 * - 不影响 Provider 配置，不影响请求路由/计费/权限
 *
 * 为什么需要一个独立 hook：
 * - 置顶状态会被多个弹窗复用（话题聊天设置/助手编辑/多模型对比…）
 * - 状态需要持久化（chrome.storage.local），并在多窗口/多视图间同步
 */

/**
 * 对模型 ID 列表做去重并保留首次出现顺序。
 *
 * 说明：
 * - 存储层可能因为历史数据或并发写入带入重复项；
 * - 这里统一清洗，避免 UI 侧重复渲染同一个模型。
 */
function uniqKeepOrder(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** `usePinnedModels` 的返回结构。 */
export interface UsePinnedModelsResult {
  /** 是否仍在读取初始置顶模型列表。 */
  loading: boolean;
  /** 保序后的置顶模型 ID 列表。 */
  pinnedModels: string[];
  /** 为频繁 membership 判断准备的集合。 */
  pinnedSet: Set<string>;
  /** 切换某个模型的置顶状态。 */
  togglePinnedModel: (modelId: string) => Promise<void>;
  /** 重新从存储层读取一次置顶模型列表。 */
  reload: () => Promise<void>;
}

/**
 * 置顶模型 hook：读取/监听/持久化“常用模型置顶列表”。
 *
 * @returns loading + pinnedModels + pinnedSet + togglePinnedModel + reload
 */
export function usePinnedModels(): UsePinnedModelsResult {
  /** 首次从存储层同步前的加载态。 */
  const [loading, setLoading] = useState(true);
  /** 当前内存里的置顶模型顺序列表。 */
  const [pinnedModels, setPinnedModels] = useState<string[]>([]);

  /**
   * 从存储层重载置顶模型列表。
   *
   * 说明：
   * - 统一经过 `uniqKeepOrder()` 清洗，确保 UI 和存储层口径一致；
   * - 首次加载与 storage 变更回流都复用这一入口。
   */
  const reload = useCallback(async () => {
    try {
      const raw = await getStorageAdapter().get([PINNED_MODELS_STORAGE_KEY]);
      const val = raw[PINNED_MODELS_STORAGE_KEY];
      const arr = Array.isArray(val) ? val.map((x) => String(x || '')).filter(Boolean) : [];
      setPinnedModels(uniqKeepOrder(arr));
    } catch (error) {
      reportBackgroundStorageFailure(error, {
        key: PINNED_MODELS_STORAGE_KEY,
        operation: 'get',
        owner: 'usePinnedModels.reload',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    consumeBackgroundStoragePromise(reload(), {
      key: PINNED_MODELS_STORAGE_KEY,
      operation: 'reload',
      owner: 'usePinnedModels.initialReload',
    });

    // 统一监听存储回流，确保 SidePanel / 设置面板等多个入口共享同一份置顶状态。
    const unsub = getStorageAdapter().onChange((changes) => {
      if (!changes[PINNED_MODELS_STORAGE_KEY]) return;
      consumeBackgroundStoragePromise(reload(), {
        key: PINNED_MODELS_STORAGE_KEY,
        operation: 'reload',
        owner: 'usePinnedModels.storageChanged',
      });
    });
    return unsub;
  }, [reload]);

  const pinnedSet = useMemo(() => new Set(pinnedModels), [pinnedModels]);

  /**
   * 切换指定模型的置顶状态。
   *
   * 说明：
   * - 先本地更新，保证弹窗内交互即时反馈；
   * - 再基于存储层最新值重新计算并写回，降低多视图并发切换时的覆盖风险。
   */
  const togglePinnedModel = useCallback(async (modelId: string) => {
    const id = String(modelId || '').trim();
    if (!id) return;

    setPinnedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return Array.from(next);
    });

    try {
      const raw = await getStorageAdapter().get([PINNED_MODELS_STORAGE_KEY]);
      const val = raw[PINNED_MODELS_STORAGE_KEY];
      const prev = Array.isArray(val) ? val.map((x) => String(x || '')).filter(Boolean) : [];
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      await getStorageAdapter().set({ [PINNED_MODELS_STORAGE_KEY]: Array.from(set) });
    } catch (error) {
      reportBackgroundStorageFailure(error, {
        key: PINNED_MODELS_STORAGE_KEY,
        operation: 'set',
        owner: 'usePinnedModels.togglePinnedModel',
      });
    }
  }, []);

  return { loading, pinnedModels, pinnedSet, togglePinnedModel, reload };
}
