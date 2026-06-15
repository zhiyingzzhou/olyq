/**
 * 说明：`useChromeStorageConfig` Hook 模块。
 *
 * 职责：
 * - 承载 `useChromeStorageConfig` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChromeStorageConfigParser`、`ChromeStorageConfigPatcher`、`UseChromeStorageConfigResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSharedJsonConfigChannel, type SharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';

/**
 * 存储配置解析函数。
 *
 * 说明：
 * - 用于把 storage 中的原始对象收敛成组件真正需要的配置片段；
 * - 返回值只需要包含需要覆盖默认值的字段。
 */
export type ChromeStorageConfigParser<T extends object> = (
  raw: Record<string, unknown>,
  defaults: T,
) => Partial<T>;

/** 存储配置局部更新函数；调用方只需传入要覆盖的字段。 */
export type ChromeStorageConfigPatcher<T extends object> = (patch: Partial<T>) => void;

/** 存储配置确定性保存函数；调用方传入完整配置并等待落盘结果。 */
export type ChromeStorageConfigSaver<T extends object> = (next: T) => Promise<T>;

/** 存储配置写回模式。 */
export type ChromeStorageConfigPersistMode = 'debounced' | 'manual';

/** `useChromeStorageConfig` 的可选行为参数。 */
export interface UseChromeStorageConfigOptions {
  /**
   * 写回模式。
   *
   * `debounced` 保持表单输入的 200ms 后台写回；`manual` 只更新内存快照，
   * 由调用方在关键用户动作里显式 `await writeStoredJson()`，避免组件快速卸载时丢失设置。
   */
  persistMode?: ChromeStorageConfigPersistMode;
}

/** `useChromeStorageConfig` 的返回结果。 */
export type UseChromeStorageConfigResult<T extends object> = [
  /** 当前内存中的配置快照。 */
  config: T,
  /** 合并式局部更新函数；只更新传入字段。 */
  patchConfig: ChromeStorageConfigPatcher<T>,
  /** 确定性保存函数；用于关键配置在用户动作内等待 storage 落盘。 */
  saveConfig: ChromeStorageConfigSaver<T>,
];

/**
 * 需求 H-11：统一 chrome.storage.local 配置加载/持久化 hook
 *
 * 封装云同步子组件的配置读写模式：
 * - 初始化和跨上下文回流统一走 shared JSON channel；
 * - 字段变更后仍保留 200ms 防抖写回，避免表单输入中频繁落盘；
 * - storage key、字段结构与 UI 行为保持不变。
 *
 * @param key - chrome.storage 的存储键（如 'olyq.sync.webdav.v1'）
 * @param defaults - 默认值对象
 * @param parse - 可选：从存储的原始对象解析为 T（可在此应用 normalizers/validators）
 * @param options - 可选行为参数；关键配置可使用 `manual` 模式自行等待落盘。
 * @returns [config, patchConfig] — 当前配置 & 部分更新函数
 */
export function useChromeStorageConfig<T extends object>(
  key: string,
  defaults: T,
  parse?: ChromeStorageConfigParser<T>,
  options?: UseChromeStorageConfigOptions,
): UseChromeStorageConfigResult<T> {
  /** 当前内存中的配置快照。 */
  const [config, setConfig] = useState<T>(defaults);
  /** 保存最新默认值，避免 load effect 因依赖变更重复执行。 */
  const defaultsRef = useRef(defaults);
  /** 保存最新 parse 函数，允许父组件重渲染后使用新解析逻辑。 */
  const parseRef = useRef(parse);
  /** 当前 key 对应的 shared JSON channel。 */
  const channelRef = useRef<SharedJsonConfigChannel<T> | null>(null);
  /** 当前 channel 绑定的 storage key。 */
  const channelKeyRef = useRef<string>('');

  // 说明：defaults/parse 可能在父组件重渲染时变更，但本 hook 的“加载行为”约定只在 mount 时执行一次；
  // 因此用 ref 保存最新引用，避免为了满足依赖数组而导致重复加载。
  useEffect(() => { defaultsRef.current = defaults; }, [defaults]);
  useEffect(() => { parseRef.current = parse; }, [parse]);

  /**
   * 获取当前 key 的 shared JSON channel。
   *
   * 说明：
   * - hook 层继续允许传入 parser/defaults，但 raw storage 读写与 storage.onChanged 回流
   *   交给 shared channel 统一处理；
   * - normalize 总是从最新 ref 读取 parser/defaults，避免父组件重渲染后写入旧规则。
   */
  const getChannel = useCallback(() => {
    if (channelRef.current && channelKeyRef.current === key) return channelRef.current;

    const channel = createSharedJsonConfigChannel<T>({
      storageKey: key,
      fallback: defaultsRef.current,
      bootstrap: { bootstrapSource: 'none' },
      clone: (value) => ({ ...value }) as T,
      normalize: (raw) => {
        const curDefaults = defaultsRef.current;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...curDefaults };
        const stored = raw as Record<string, unknown>;
        const curParse = parseRef.current;
        if (curParse) return { ...curDefaults, ...curParse(stored, curDefaults) };

        const merged = { ...curDefaults } as T;
        const defaultsRecord = curDefaults as Record<string, unknown>;
        const mergedRecord = merged as Record<string, unknown>;
        for (const keyName of Object.keys(curDefaults)) {
          const storedValue = stored[keyName];
          if (storedValue !== undefined && typeof storedValue === typeof defaultsRecord[keyName]) {
            mergedRecord[keyName] = storedValue;
          }
        }
        return merged;
      },
    });
    channelRef.current = channel;
    channelKeyRef.current = key;
    return channel;
  }, [key]);

  const persistMode = options?.persistMode ?? 'debounced';

  // 加载与订阅：由 shared channel 统一管理 storage 回流。
  useEffect(() => {
    const channel = getChannel();
    setConfig(channel.getSnapshot());
    void channel.refreshFromStorage({ emitIfChanged: true });
    return channel.subscribe(() => {
      setConfig(channel.getSnapshot());
    });
  }, [getChannel]);

  // 保存：200ms 防抖，避免表单输入过程中每次按键都落盘。
  /** 首次渲染时跳过写回，避免 mount 后立刻把默认值覆盖到存储层。 */
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (persistMode === 'manual') {
      isFirstRender.current = false;
      return;
    }
    // 跳过首次渲染（mount 时不应写回默认值）
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = globalThis.setTimeout(() => {
      getChannel().save(config);
    }, 200);
    return () => globalThis.clearTimeout(timer);
  }, [config, getChannel, persistMode]);

  const patchConfig = useCallback<ChromeStorageConfigPatcher<T>>((patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveConfig = useCallback<ChromeStorageConfigSaver<T>>(async (next) => {
    return await getChannel().saveAsync(next);
  }, [getChannel]);

  return [config, patchConfig, saveConfig];
}
