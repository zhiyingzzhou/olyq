/**
 * 说明：`shared-json-config-channel` 基础能力模块。
 *
 * 职责：
 * - 为浏览器扩展里的“小型共享 JSON 配置”提供统一的 bootstrap、缓存、storage 回流与同窗口信号契约；
 * - 避免业务模块继续各自手写 `readStoredJson + subscribeStoredKeys + writeStoredJson + 自定义事件` 组合协议；
 * - 把 startup snapshot、bootstrap mirror 和无 bootstrap 三类入口统一收口到一个工厂。
 *
 * 边界：
 * - 这里只服务轻量 JSON 配置，不负责大型业务 store、IndexedDB 或消息库；
 * - 不替代 `json-storage`，而是建立在它之上的共享通道约束。
 */
import {
  readBootstrapStoredJsonSeed,
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJson,
  writeStoredJsonInBackground,
} from './json-storage';

const SHARED_JSON_CHANNEL_STARTUP_MISSING = Symbol('shared-json-channel-startup-missing');

/** shared channel 的 startup / bootstrap 入口类型。 */
export type SharedJsonConfigBootstrap =
  | {
      bootstrapSource: 'bootstrap-mirror';
    }
  | {
      bootstrapSource: 'startup-snapshot';
      readRaw: (fallback: unknown) => unknown;
      hasStorageValue: () => boolean;
      isUsableValue?: (raw: unknown) => boolean;
    }
  | {
      bootstrapSource: 'none';
    };

/** same-window 即时回流信号。 */
export type SharedJsonConfigSameWindowSignal =
  | {
      type: 'custom-event';
      eventName: string;
    }
  | {
      type: 'none';
    };

/** 创建 shared channel 所需的选项。 */
export interface SharedJsonConfigChannelOptions<T> {
  /** 存储键。 */
  storageKey: string;
  /** 默认值。 */
  fallback: T;
  /** 原始值规整器。 */
  normalize: (raw: unknown) => T;
  /** 快照克隆器。 */
  clone: (value: T) => T;
  /** 相等性判断。 */
  isEqual?: (left: T, right: T) => boolean;
  /** bootstrap 入口。 */
  bootstrap?: SharedJsonConfigBootstrap;
  /** 当前窗口即时回流方式。 */
  sameWindowSignal?: SharedJsonConfigSameWindowSignal;
  /** 写入或回流后要执行的副作用。 */
  applySideEffect?: (value: T) => void;
}

/** shared channel 暴露的统一能力。 */
export interface SharedJsonConfigChannel<T> {
  /** 当前页启动时是否已经命中可信的 startup storage 快照。 */
  hydratedFromStartupStorage: boolean;
  /** 读取当前缓存快照。 */
  getSnapshot: () => T;
  /** 写入并更新当前缓存。 */
  save: (next: unknown) => T;
  /** 等待写入完成后再更新当前缓存，供关键用户动作保留失败语义。 */
  saveAsync: (next: unknown) => Promise<T>;
  /** 从共享存储刷新缓存。 */
  refreshFromStorage: (options?: {
    emitIfChanged?: boolean;
    notifyOnUnchanged?: boolean;
  }) => Promise<{ changed: boolean; value: T }>;
  /** 订阅当前 channel 的变化。 */
  subscribe: (callback: () => void) => () => void;
}

/**
 * 默认相等性判断。
 *
 * 说明：
 * - 当前 channel 只服务小型 JSON 配置，`JSON.stringify` 的成本和语义都可接受；
 * - 若某个模块需要更细粒度判断，可在 options 里覆盖。
 */
function defaultIsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 生成当前窗口内的本地信号 token，用于忽略自己刚发出的 custom event。
 */
function createSignalToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 创建共享 JSON 配置通道。
 *
 * @param options - channel 配置。
 * @returns 当前模块唯一应该消费的 JSON 配置通道。
 */
export function createSharedJsonConfigChannel<T>(
  options: SharedJsonConfigChannelOptions<T>,
): SharedJsonConfigChannel<T> {
  const normalizedStorageKey = String(options.storageKey || '').trim();
  const normalize = options.normalize;
  const clone = options.clone;
  const isEqual = options.isEqual ?? defaultIsEqual;
  const bootstrap = options.bootstrap ?? { bootstrapSource: 'none' };
  const sameWindowSignal = options.sameWindowSignal ?? { type: 'none' };
  const subscribers = new Set<() => void>();
  let lastLocalSignalToken = '';
  let hydratedFromStartupStorage = false;
  let disposeSameWindowSignalListener: (() => void) | null = null;

  /**
   * 执行 channel 级副作用。
   *
   * @param value - 当前快照。
   */
  const applySideEffect = (value: T) => {
    options.applySideEffect?.(clone(value));
  };

  /**
   * 广播当前 channel 变化。
   */
  const notifySubscribers = () => {
    for (const callback of subscribers) callback();
  };

  /**
   * 解析当前模块启动期种子值。
   *
   * 说明：
   * - `startup-snapshot` 会同时记录“是否真的命中 storage 真源”；
   * - `bootstrap-mirror` 只提供启动种子，不会把当前页标成已可信 hydration。
   */
  const readBootstrapValue = (): T => {
    if (bootstrap.bootstrapSource === 'bootstrap-mirror') {
      return readBootstrapStoredJsonSeed(normalizedStorageKey, clone(options.fallback), normalize);
    }

    if (bootstrap.bootstrapSource === 'startup-snapshot') {
      const raw = bootstrap.readRaw(SHARED_JSON_CHANNEL_STARTUP_MISSING);
      const usable = raw !== SHARED_JSON_CHANNEL_STARTUP_MISSING
        && (bootstrap.isUsableValue ? bootstrap.isUsableValue(raw) : true);
      hydratedFromStartupStorage = bootstrap.hasStorageValue() && usable;
      if (usable) return normalize(raw);
    }

    return clone(options.fallback);
  };

  let cache = readBootstrapValue();

  /**
   * 同步读取当前缓存。
   */
  const getSnapshot = (): T => clone(cache);

  /**
   * 从共享存储刷新当前缓存。
   *
   * @param refreshOptions - 是否向订阅者发通知。
   * @returns 变化状态与最新值。
   */
  const refreshFromStorage = async (refreshOptions?: {
    emitIfChanged?: boolean;
    notifyOnUnchanged?: boolean;
  }): Promise<{ changed: boolean; value: T }> => {
    const next = await readStoredJson(normalizedStorageKey, cache, normalize);
    const changed = !isEqual(cache, next);
    cache = next;
    applySideEffect(cache);
    if ((changed && refreshOptions?.emitIfChanged) || (!changed && refreshOptions?.notifyOnUnchanged)) {
      notifySubscribers();
    }
    return { changed, value: getSnapshot() };
  };

  /**
   * 派发当前窗口内的 local signal。
   */
  const emitLocalSignal = () => {
    if (sameWindowSignal.type !== 'custom-event' || typeof window === 'undefined') return;
    lastLocalSignalToken = createSignalToken();
    try {
      window.dispatchEvent(new CustomEvent(sameWindowSignal.eventName, {
        detail: { token: lastLocalSignalToken },
      }));
    } catch {
      // ignore local signal failures
    }
  };

  /**
   * 写入新值并更新缓存。
   *
   * 说明：
   * - 当前页订阅者会立即收到通知；
   * - storage.onChanged 只负责跨上下文回流，不再承担本页唯一同步机制。
   *
   * @param next - 待写入值。
   * @returns 最新快照。
   */
  const save = (next: unknown): T => {
    const normalized = normalize(next);
    const changed = !isEqual(cache, normalized);
    cache = normalized;
    applySideEffect(cache);
    writeStoredJsonInBackground(normalizedStorageKey, cache, 'shared-json-config-channel');
    if (changed) {
      notifySubscribers();
      emitLocalSignal();
    }
    return getSnapshot();
  };

  /**
   * 等待写入成功后再提交本地缓存。
   *
   * 说明：用于“保存后立刻影响后台任务”的关键路径。和 `save()` 的后台副作用
   * 不同，这里会把 storage 失败交还给调用方，并在失败时保留原缓存，方便 UI 回滚。
   *
   * @param next - 待写入值。
   * @returns 最新快照。
   */
  const saveAsync = async (next: unknown): Promise<T> => {
    const normalized = normalize(next);
    await writeStoredJson(normalizedStorageKey, normalized);
    const changed = !isEqual(cache, normalized);
    cache = normalized;
    applySideEffect(cache);
    if (changed) {
      notifySubscribers();
      emitLocalSignal();
    }
    return getSnapshot();
  };

  void subscribeStoredKeys([normalizedStorageKey], () => {
    void refreshFromStorage({ emitIfChanged: true });
  });

  /**
   * 需要时才挂载 same-window 事件监听，避免测试与 HMR 下重复 import 累积悬空监听。
   */
  const ensureSameWindowSignalListener = () => {
    if (
      disposeSameWindowSignalListener
      || sameWindowSignal.type !== 'custom-event'
      || typeof window === 'undefined'
    ) {
      return;
    }
    /**
     * 处理外部 same-window 事件回流。
     *
     * @param event - 当前窗口收到的 custom event。
     */
    const handler = (event: Event) => {
      const token = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? String((event.detail as { token?: unknown }).token || '')
        : '';
      if (token && token === lastLocalSignalToken) return;
      void refreshFromStorage({ emitIfChanged: true, notifyOnUnchanged: true });
    };
    window.addEventListener(sameWindowSignal.eventName, handler);
    disposeSameWindowSignalListener = () => {
      window.removeEventListener(sameWindowSignal.eventName, handler);
      disposeSameWindowSignalListener = null;
    };
  };

  return {
    hydratedFromStartupStorage,
    getSnapshot,
    save,
    saveAsync,
    refreshFromStorage,
    subscribe: (callback: () => void) => {
      subscribers.add(callback);
      ensureSameWindowSignalListener();
      return () => {
        subscribers.delete(callback);
        if (subscribers.size < 1) {
          disposeSameWindowSignalListener?.();
        }
      };
    },
  };
}
