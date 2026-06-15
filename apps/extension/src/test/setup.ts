/**
 * 说明：`setup` 源码模块。
 *
 * 职责：
 * - 承载 `setup` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import "@testing-library/jest-dom";
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { vi } from 'vitest';

vi.mock('@testing-library/react', async () => {
  const actual = await vi.importActual<typeof import('@testing-library/react')>('@testing-library/react');
  const React = await import('react');
  const { TooltipProvider } = await vi.importActual<typeof import('@/components/ui/tooltip')>('@/components/ui/tooltip');

  /**
   * 测试期统一补齐 TooltipProvider，模拟扩展真实根入口。
   *
   * @param children - 当前测试 render 的 React 子树。
   * @returns 已挂载 TooltipProvider 的测试根壳。
   */
  const TooltipTestWrapper = ({ children }: { children: import('react').ReactNode }) => (
    React.createElement(TooltipProvider, { delayDuration: 0, skipDelayDuration: 0, children })
  );

  /**
   * 包装 RTL `render`，在保留外部 wrapper 的同时注入 TooltipProvider。
   *
   * @param args - 原始 RTL render 参数。
   * @returns 注入共享 tooltip 根壳后的 render 结果。
   */
  const render = (...[ui, options]: Parameters<typeof actual.render>) => {
    const ExistingWrapper = options?.wrapper;

    /**
     * 合并调用方自定义 wrapper 与共享 tooltip 根壳。
     *
     * @param children - 当前待渲染子树。
     * @returns 已串联 caller wrapper 与 TooltipProvider 的测试容器。
     */
    const CombinedWrapper = ({ children }: { children: import('react').ReactNode }) => {
      const content = ExistingWrapper
        ? React.createElement(ExistingWrapper, null, children)
        : children;
      return React.createElement(TooltipTestWrapper, null, content);
    };

    return actual.render(ui, {
      ...options,
      wrapper: CombinedWrapper,
    });
  };

  return {
    ...actual,
    render,
  };
});

const TEST_CONSOLE_FAIL_PATTERNS = {
  error: [
    /^Warning:/i,
    /not wrapped in act/i,
    /act\(/i,
  ],
  warn: [
    /NO_I18NEXT_INSTANCE/i,
    /not wrapped in act/i,
    /act\(/i,
  ],
} as const;
const TEST_CONSOLE_ALLOWLIST: RegExp[] = [];

/**
 * 将 console 参数压平成单条可匹配消息。
 *
 * @param args - console 原始参数。
 * @returns 统一字符串消息。
 */
function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

/**
 * 判断当前 console 消息是否需要直接让测试失败。
 *
 * @param method - console 方法名。
 * @param message - 已格式化的 console 文本。
 * @returns 是否应该 fail-fast。
 */
function shouldFailConsole(method: 'error' | 'warn', message: string): boolean {
  if (TEST_CONSOLE_ALLOWLIST.some((pattern) => pattern.test(message))) return false;
  return TEST_CONSOLE_FAIL_PATTERNS[method].some((pattern) => pattern.test(message));
}

/**
 * 安装测试环境 console fail-fast guard。
 *
 * 说明：
 * - React `act(...)`、`Warning:` 和 `NO_I18NEXT_INSTANCE` 一律不允许静默通过；
 * - 其它日志仍回落到原始 console，避免误伤正常诊断输出。
 */
function installConsoleGuard(): void {
  const originalConsoleError = console.error.bind(console);
  const originalConsoleWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    const message = formatConsoleArgs(args);
    if (shouldFailConsole('error', message)) {
      throw new Error(`[test-console-guard:error] ${message}`);
    }
    originalConsoleError(...args);
  };

  console.warn = (...args: unknown[]) => {
    const message = formatConsoleArgs(args);
    if (shouldFailConsole('warn', message)) {
      throw new Error(`[test-console-guard:warn] ${message}`);
    }
    originalConsoleWarn(...args);
  };
}

if (!i18n.isInitialized) {
  await i18n.use(initReactI18next).init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
      'en-US': {
        translation: {},
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });
}

installConsoleGuard();

if (typeof window !== "undefined") {
  class LocalStorageMock implements Storage {
    #store = new Map<string, string>();

        /**
     * 读取器：`length`。
     *
     * @remarks
     * 用于返回当前实例上的派生状态或只读视图，调用方应结合所属类的状态流理解它的时序语义。
     */
    get length(): number {
      return this.#store.size;
    }

        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    clear(): void {
      this.#store.clear();
    }

        /**
     * 内部方法：`getItem`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    getItem(key: string): string | null {
      return this.#store.has(key) ? this.#store.get(key) ?? null : null;
    }

        /**
     * 内部方法：`key`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    key(index: number): string | null {
      return Array.from(this.#store.keys())[index] ?? null;
    }

        /**
     * 内部方法：`removeItem`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    removeItem(key: string): void {
      this.#store.delete(String(key));
    }

        /**
     * 内部方法：`setItem`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    setItem(key: string, value: string): void {
      this.#store.set(String(key), String(value));
    }

        /**
     * 内部方法：`keys`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    keys(): string[] {
      return Array.from(this.#store.keys());
    }

        /**
     * 内部方法：`has`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    has(key: string): boolean {
      return this.#store.has(key);
    }
  }

  const localStorageMock = new Proxy(new LocalStorageMock(), {
        /**
     * 内部方法：`get`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    get(target, prop) {
      if (typeof prop === "string" && !(prop in target)) {
        return target.getItem(prop) ?? undefined;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
        /**
     * 内部方法：`set`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    set(target, prop, value) {
      if (typeof prop === "string" && !(prop in target)) {
        target.setItem(prop, String(value));
        return true;
      }
      return Reflect.set(target, prop, value, target);
    },
        /**
     * 内部方法：`deleteProperty`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    deleteProperty(target, prop) {
      if (typeof prop === "string" && !(prop in target)) {
        target.removeItem(prop);
        return true;
      }
      return Reflect.deleteProperty(target, prop);
    },
        /**
     * 内部方法：`has`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    has(target, prop) {
      return (typeof prop === "string" && target.has(prop)) || prop in target;
    },
        /**
     * 内部方法：`ownKeys`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    ownKeys(target) {
      return target.keys();
    },
        /**
     * 内部方法：`getOwnPropertyDescriptor`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && target.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          value: target.getItem(prop),
          writable: true,
        };
      }
      return undefined;
    },
  }) as Storage;

  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: localStorageMock,
  });

  Object.defineProperty(globalThis, "localStorage", {
    writable: true,
    configurable: true,
    value: localStorageMock,
  });

  class ResizeObserverMock {
        /**
     * 内部方法：`observe`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    observe() {}
        /**
     * 内部方法：`unobserve`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    unobserve() {}
        /**
     * 内部方法：`disconnect`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    disconnect() {}
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });

  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
}
