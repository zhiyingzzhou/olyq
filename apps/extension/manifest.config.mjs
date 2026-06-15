import { defineManifest } from "@crxjs/vite-plugin";
import { getBuildConfig } from "./build-config.mjs";
import {
  CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS,
  TECHNOLOGY_STACK_BRIDGE_RESOURCE,
  WEB_PAGE_MATCHES,
} from "./crx-manifest-helpers.mjs";

const BUILD_CONFIG = getBuildConfig();
const TARGET_BROWSER = BUILD_CONFIG.target;
const CHROMIUM_EXTENSION_KEY = BUILD_CONFIG.chromiumExtensionKey;

/**
 * 扩展清单（Manifest V3）
 * - 由 CRXJS 在构建时生成最终的 `dist/manifest.json`
 * - 路径均相对 Vite 项目根目录（禁止 `./` 或 `/` 前缀）
 */
export default defineManifest({
  // 说明：Firefox 与 Chromium（Chrome/Edge）在 MV3 的 API/manifest 能力上仍存在差异：
  // - Chromium：使用 side_panel + sidePanel API
  // - Firefox：使用 sidebar_action + sidebarAction API（不支持 side_panel）
  // 因此本项目采用“目标浏览器分构建”策略，彻底切换，不做向后兼容。
  ...(TARGET_BROWSER === "firefox"
    ? {
        browser_specific_settings: {
          gecko: {
            // 注意：提交 AMO 时需要稳定的 Add-on ID；建议在 CI 中用环境变量覆盖。
            id: BUILD_CONFIG.firefoxId,
            // MV3 在 Firefox 109 开始可用；如需依赖更高版本能力可在后续收紧。
            strict_min_version: "109.0",
          },
        },
      }
    : {}),
  manifest_version: 3,
  default_locale: "zh_CN",
  name: "__MSG_appName__",
  description: "__MSG_appDescription__",
  version: BUILD_CONFIG.version,
  ...(TARGET_BROWSER === "chromium" ? { minimum_chrome_version: "114" } : {}),
  ...(CHROMIUM_EXTENSION_KEY ? { key: CHROMIUM_EXTENSION_KEY } : {}),


  /**
   * CSP（扩展页）
   * - Transformers.js / onnxruntime-web 需要加载 .wasm 并进行编译
   * - MV3 下不允许 'unsafe-eval'，但允许更窄范围的 'wasm-unsafe-eval'
   */
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob: https: http:;",
  },

  // 顶部工具栏图标：当前只作为打开主侧栏的浏览器 action，不再声明 popup 中转层。
  action: {
    default_title: "__MSG_appActionTitle__",
  },

  // 可配置快捷键入口：不提供 suggested_key，避免默认抢占系统/浏览器快捷键。
  commands:
    TARGET_BROWSER === "firefox"
      ? {
          _execute_sidebar_action: {
            description: "__MSG_commandOpenPanel__",
          },
        }
      : {
          _execute_action: {
            description: "__MSG_commandOpenPanel__",
          },
        },

  // 侧边栏主工作区
  // - Chromium：Side Panel（右侧面板，按 tabId）
  // - Firefox：Sidebar（浏览器侧栏，独立 UI）
  ...(TARGET_BROWSER === "chromium"
    ? {
        side_panel: {
          default_path: "src/extension/sidepanel/index.html",
        },
      }
    : {
        sidebar_action: {
          default_title: "__MSG_appActionTitle__",
          default_panel: "src/extension/sidepanel/index.html",
          open_at_install: false,
        },
      }),

  // 后台 Service Worker（MV3）
  background: {
    service_worker: "src/extension/background/service-worker.ts",
    type: "module",
  },

  /**
   * 权限说明（彻底切换为安装期普通网页能力）
   * - storage：存储模型平台 Key/配置
   * - alarms：心跳唤醒（缓解 SW 闲置销毁）
   * - sidePanel：打开/控制侧边栏
   * - activeTab/tabs：获取当前标签页信息、打开侧边栏所需 tabId
   * - webNavigation：枚举普通网页内 frame，用于 browser-context 在顶层正文不足时按需采集 iframe 正文
   * - scripting：执行脚本（网页自动化 / 本地搜索等能力）
   * - webRequest：技术栈插件读取 main_frame 响应头与脚本/XHR URL 信号
   * - cookies：技术栈插件只在本地内存读取 cookie 名称/模式用于识别，不存储、不展示、不喂给 AI
   * - offscreen：创建离屏文档（未来承载 WebGPU/DOMParser/本地向量化）
   * - identity：MCP 远程服务 OAuth 授权，统一经 chrome.identity.getRedirectURL / launchWebAuthFlow
   * - system.cpu：开发者性能面板展示系统 CPU 估算值；Firefox 构建不声明该 Chromium 专属能力
   */
  permissions:
    TARGET_BROWSER === "chromium"
      ? ["storage", "alarms", "sidePanel", "activeTab", "tabs", "scripting", "webNavigation", "webRequest", "cookies", "offscreen", "identity", "system.cpu"]
      : ["storage", "alarms", "activeTab", "tabs", "scripting", "webNavigation", "webRequest", "cookies", "identity"],

  /**
   * 内建网站权限（非可选）
   *
   * 说明：
   * - `captureVisibleTab()` 在异步 Service Worker 链路里需要 `<all_urls>` 安装期权限，
   *   否则截图编辑器与元素视觉区域会脱离用户手势窗口后失败；
   * - 本版本彻底移除运行时网页授权弹窗，安装后直接具备普通网页 host access；
   * - 注入面仍只声明普通 http/https 网页，不会覆盖内部页、扩展页、about: 或 file:。
   */
  host_permissions: [...CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS],

  // 选择助手：网页划选后出现的浮动菜单（Shadow DOM 隔离）
  content_scripts: [
    {
      // 静态注入普通网页：页面工具、browser-context 与 technology-stack 插件共用同一条内容脚本入口。
      matches: [...WEB_PAGE_MATCHES],
      js: ["src/extension/content-script/index.ts"],
      run_at: "document_idle",
      all_frames: true,
      match_about_blank: true,
      ...(TARGET_BROWSER === "chromium" ? { match_origin_as_fallback: true } : {}),
    },
  ],

  // 显式声明 web_accessible_resources，限制暴露范围。
  // 生产构建中只暴露 technology-stack page-world bridge，防止恶意网页枚举内部资源。
  // 开发模式下 CRXJS 仍会自动追加 HMR loader 所需的资源（预期行为）。
  web_accessible_resources: [
    {
      // 仅对 http/https 页面暴露，与当前 all-sites 运行时授权模型保持一致。
      matches: [...WEB_PAGE_MATCHES],
      resources: [TECHNOLOGY_STACK_BRIDGE_RESOURCE],
    },
  ],

  // 扩展图标
  icons: {
    16: "icons/olyq-16.png",
    32: "icons/olyq-32.png",
    48: "icons/olyq-48.png",
    128: "icons/olyq-128.png",
  },
});
