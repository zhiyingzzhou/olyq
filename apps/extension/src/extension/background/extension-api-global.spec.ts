/**
 * 说明：`extension-api-global.spec` 后台启动层回归测试。
 *
 * 职责：
 * - 锁住 Service Worker 顶层监听器注册之前的扩展 API 命名空间归一化；
 * - 覆盖 Chromium 原生 `chrome.*`、Firefox / WebExtensions `browser.*` 与无效运行时三类启动场景。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** WebExtensions 事件对象的最小测试替身。 */
type TestEvent = {
  /** 注册事件监听器。 */
  addListener: ReturnType<typeof vi.fn>;
};

/** 测试中需要的最小后台扩展 API。 */
type TestBackgroundApi = Partial<typeof chrome> & {
  /** 测试标记，用于确认对象身份没有被误替换。 */
  __label?: string;
};

/** 构造带 `addListener` 的扩展事件替身。 */
function createEvent(): TestEvent {
  return { addListener: vi.fn() };
}

/**
 * 构造 Service Worker 顶层启动需要的最小扩展 API。
 *
 * @param label - 对象身份标记。
 * @returns 可通过后台启动层校验的扩展 API 替身。
 */
function createStartupApi(label: string): TestBackgroundApi {
  return {
    __label: label,
    runtime: {
      onInstalled: createEvent(),
      onConnect: createEvent(),
      onMessage: createEvent(),
    },
    alarms: { onAlarm: createEvent() },
    tabs: {
      onActivated: createEvent(),
      onUpdated: createEvent(),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: createEvent(),
    },
  } as unknown as TestBackgroundApi;
}

/** 重新执行带顶层副作用的启动层模块。 */
async function importFreshExtensionApiGlobal() {
  vi.resetModules();
  return await import("./extension-api-global");
}

describe("extension api global bootstrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("chrome 后台启动 API 完整时保持原生 chrome 对象", async () => {
    const chromeApi = createStartupApi("chrome");
    const browserApi = createStartupApi("browser");
    vi.stubGlobal("chrome", chromeApi);
    vi.stubGlobal("browser", browserApi);

    const mod = await importFreshExtensionApiGlobal();

    expect(mod.installBackgroundExtensionApiGlobal()).toBe(chromeApi);
    expect(globalThis.chrome).toBe(chromeApi);
    expect(globalThis.chrome).not.toBe(browserApi);
  });

  it("chrome 不完整但 browser 完整时补齐 SW 顶层监听所需入口", async () => {
    const sidePanel = { open: vi.fn() };
    const chromeApi = { __label: "partial-chrome", sidePanel } as unknown as TestBackgroundApi;
    const browserApi = createStartupApi("browser");
    vi.stubGlobal("chrome", chromeApi);
    vi.stubGlobal("browser", browserApi);

    await importFreshExtensionApiGlobal();

    expect(globalThis.chrome).toBe(chromeApi);
    expect(globalThis.chrome.runtime).toBe(browserApi.runtime);
    expect(globalThis.chrome.alarms).toBe(browserApi.alarms);
    expect(globalThis.chrome.tabs).toBe(browserApi.tabs);
    expect(globalThis.chrome.windows).toBe(browserApi.windows);
    expect(globalThis.chrome.sidePanel).toBe(sidePanel);
  });

  it("只有 browser 后台 API 可用时把 browser 设为统一 chrome 入口", async () => {
    const browserApi = createStartupApi("browser");
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", browserApi);

    await importFreshExtensionApiGlobal();

    expect(globalThis.chrome).toBe(browserApi);
  });

  it("后台运行时 API 不可用时抛出明确启动错误", async () => {
    vi.stubGlobal("chrome", { runtime: {} });
    vi.stubGlobal("browser", { runtime: { onInstalled: createEvent() } });

    await expect(importFreshExtensionApiGlobal()).rejects.toThrow(
      "extension background runtime API is unavailable",
    );
  });
});
