/**
 * 说明：`storage-adapter` 基础能力模块。
 *
 * 职责：
 * - 承载 `storage-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StorageAdapter`、`memoryStorageAdapter`、`localStorageAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError } from '@/lib/i18n/error'

/** 最小化的 KV 存储抽象（统一 localStorage / chrome.storage.local / 内存存储的调用形态）。 */
export interface StorageAdapter {
  /** 读取指定 key 列表对应的值；未命中的 key 不会出现在返回对象中。 */
  get(keys: string[]): Promise<Record<string, unknown>>
  /** 批量写入多个键值；具体覆盖语义由底层存储实现决定。 */
  set(items: Record<string, unknown>): Promise<void>
  /** 批量删除多个 key。 */
  remove(keys: string[]): Promise<void>
  /** 订阅存储变更；返回值为取消订阅函数。 */
  onChange(callback: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void): () => void
}

/**
 * 内存存储适配器：适合测试或作为降级兜底。
 *
 * 说明：
 * - 数据只保存在当前 JS 上下文内，刷新后即丢失；
 * - 不提供真正的跨上下文变更通知，因此 `onChange` 只返回空取消函数。
 */
export function memoryStorageAdapter(): StorageAdapter {
  const store = new Map<string, unknown>()
  return {
        /**
     * 内部方法：`get`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async get(keys) {
      const result: Record<string, unknown> = {}
      for (const key of keys) {
        if (store.has(key)) {
          result[key] = store.get(key)
        }
      }
      return result
    },
        /**
     * 内部方法：`set`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value)
      }
    },
        /**
     * 内部方法：`remove`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async remove(keys) {
      for (const key of keys) {
        store.delete(key)
      }
    },
        /**
     * 内部方法：`onChange`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    onChange() {
      // 内存适配器无需监听：返回一个空的取消函数
      return () => {}
    }
  }
}

/**
 * localStorage 适配器：对 `window.localStorage` 做一层 JSON 序列化封装。
 *
 * 说明：
 * - 读取时优先尝试 JSON.parse，失败则回退为原始字符串；
 * - 变更通知依赖浏览器原生 `storage` 事件，因此只会感知跨文档写入。
 */
export function localStorageAdapter(): StorageAdapter {
  return {
        /**
     * 内部方法：`get`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async get(keys) {
      const result: Record<string, unknown> = {}
      for (const key of keys) {
        const raw = localStorage.getItem(key)
        if (raw !== null) {
          try {
            result[key] = JSON.parse(raw)
          } catch {
            result[key] = raw
          }
        }
      }
      return result
    },
        /**
     * 内部方法：`set`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        localStorage.setItem(key, JSON.stringify(value))
      }
    },
        /**
     * 内部方法：`remove`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async remove(keys) {
      for (const key of keys) {
        localStorage.removeItem(key)
      }
    },
        /**
     * 内部方法：`onChange`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    onChange(callback) {
      /**
       * 处理浏览器原生 `storage` 事件并映射到统一变更结构。
       *
       * 说明：
       * - `storage` 事件只会在“其他文档上下文”触发，本页自己的写入不会回调到这里；
       * - 旧值/新值会尽量反序列化成 JSON，保持与 `get()` 的返回形态一致。
       */
      const listener = (e: StorageEvent) => {
        if (!e.key) return
        const mapped: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}
        mapped[e.key] = {
          oldValue: e.oldValue != null ? (() => { try { return JSON.parse(e.oldValue!) } catch { return e.oldValue } })() : undefined,
          newValue: e.newValue != null ? (() => { try { return JSON.parse(e.newValue!) } catch { return e.newValue } })() : undefined,
        }
        callback(mapped)
      }
      window.addEventListener('storage', listener)
      return () => window.removeEventListener('storage', listener)
    }
  }
}

/**
 * chrome.storage.local 适配器：将 callback 风格封装为 Promise。
 *
 * 说明：
 * - 所有 `runtime.lastError` 都会提升为可国际化错误，交给上层统一展示；
 * - `onChange` 只监听 `local` 区域，保持和本项目使用范围一致。
 */
export function chromeLocalStorageAdapter(): StorageAdapter {
  return {
        /**
     * 内部方法：`get`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    get(keys) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new I18nError('errors.chromeStorageFailedWithDetail', { detail: chrome.runtime.lastError.message }, { cause: chrome.runtime.lastError }))
          } else {
            resolve(result as Record<string, unknown>)
          }
        })
      })
    },
        /**
     * 内部方法：`set`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    set(items) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new I18nError('errors.chromeStorageFailedWithDetail', { detail: chrome.runtime.lastError.message }, { cause: chrome.runtime.lastError }))
          } else {
            resolve()
          }
        })
      })
    },
        /**
     * 内部方法：`remove`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    remove(keys) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(new I18nError('errors.chromeStorageFailedWithDetail', { detail: chrome.runtime.lastError.message }, { cause: chrome.runtime.lastError }))
          } else {
            resolve()
          }
        })
      })
    },
        /**
     * 内部方法：`onChange`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    onChange(callback) {
      /**
       * 监听 chrome.storage 的跨上下文变更并收敛成统一事件格式。
       *
       * 说明：
       * - 这里只关心 `local` 区域，避免 sync/session 等其他区域的写入混入当前扩展数据流；
       * - `changes` 会原样保留 old/newValue，交由上层自行决定是否做进一步结构校验。
       */
      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return
        const mapped: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}
        for (const [key, change] of Object.entries(changes)) {
          mapped[key] = { oldValue: change.oldValue, newValue: change.newValue }
        }
        callback(mapped)
      }
      chrome.storage.onChanged.addListener(listener)
      return () => chrome.storage.onChanged.removeListener(listener)
    }
  }
}

/** 惰性缓存后的默认存储适配器单例。 */
let _cachedAdapter: StorageAdapter | undefined

/**
 * 获取默认存储适配器。
 *
 * 说明：
 * - 优先使用 `chrome.storage.local`，因为它具备跨页面共享与 onChanged 通知能力；
 * - 在非扩展运行时或测试环境中自动回退到内存实现。
 */
export function getStorageAdapter(): StorageAdapter {
  if (_cachedAdapter) return _cachedAdapter
  if (
    typeof chrome !== 'undefined' &&
    chrome.storage &&
    chrome.storage.local
  ) {
    _cachedAdapter = chromeLocalStorageAdapter()
  } else if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    _cachedAdapter = localStorageAdapter()
  } else {
    _cachedAdapter = memoryStorageAdapter()
  }
  return _cachedAdapter
}

/**
 * 重置默认存储适配器缓存。
 *
 * @remarks
 * 仅供单测在同一模块实例里切换 `chrome.storage.local` / `localStorage`
 * 宿主能力时使用。生产路径不调用该函数，运行时仍保持惰性单例，避免重复包装
 * Chrome callback API。
 */
export function resetStorageAdapterForTesting(): void {
  _cachedAdapter = undefined
}
