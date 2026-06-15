# 扩展目录速览（src/extension）

本目录是浏览器扩展（Manifest V3）的实现层，核心特点是：**以 Service Worker 为“总线”**，把主工作区（Side Panel / Sidebar）、Content Script、Offscreen Document 串起来。

## 目录结构

- `background/`：Service Worker 运行的后台逻辑（消息路由、流式转发、Offscreen 管理、MCP 反向桥接等）
- `bridge/`：UI 与 Service Worker 通信的封装（Port 单例）
- `content-script/`：注入网页的脚本（划词助手、正文提取等）
- `offscreen/`：离屏文档运行时（预留承载 WebGPU/DOMParser 等 SW 不具备的能力；当前不做本地向量化）
- `sidepanel/`：主面板入口（主工作区；复用应用 UI）

## 网站权限与静态注入（必读）

本扩展已经彻底切换到安装期普通网页访问模型：manifest 的 `host_permissions` 字段固定声明 `<all_urls>`，仅用于 Service Worker 异步 `captureVisibleTab()` 支撑网页截图编辑器和元素选择器视觉区域截图，以及用户触发的聊天 Markdown 链接预览元数据抓取；静态 `content_scripts` 仍只在普通 `http://*/*`、`https://*/*` 网页 `document_idle` 注入。

- 不再保留可选网页访问声明、授权弹窗、动态 content script 注册或设置页撤销入口；
- content script 只匹配普通 `http/https` 页面，`chrome://`、`about:`、`file:`、`chrome-extension://`、`moz-extension://` 等内部或非网页 URL 固定按不可采集处理；
- 链接预览只允许公网 `http/https` 请求 URL、重定向目标和预览图片 URL；manual redirect 若被浏览器过滤成 opaque redirect，不退回自动 follow；后台以总 deadline 收束 fetch、headers、body read、parse 和 cache，timeout 不缓存，原始 HTML 不缓存；
- Service Worker 可以用 `webRequest` 补充响应头与脚本/XHR URL，用 `cookies` 只读取 cookie 名称参与本地匹配；cookie 原始值禁止存储、展示或进入 AI prompt；
- `web_accessible_resources` 只暴露 `technology-stack-bridge.js` 这类明确需要 page-world 执行的桥接脚本，禁止宽泛 glob。

## 技术栈探测插件

`technology-stack` 是可插拔页面探测插件，职责边界如下：

- content script 采集 meta、script src、DOM、language 和 allowlist JS window chain；HTML/text/CSS/inline script 在 staged full scan 里做页面侧完整匹配，只回传命中摘要，原始大段内容不出页面侧；普通 `http/https` 主 frame 会在 ready 后发送 `technology-stack/page-ready` 触发首次自动预热，SPA `pushState` / `replaceState` / `popstate` / `hashchange` 也会 debounce 后重新上报；
- Service Worker 采集 main frame headers、cookie 名称和 tab scoped 请求 URL；页面 ready、tab 激活/完成、metadata 更新、弹窗请求和 browser-context collector 都复用同一条 fast-first 检测，不等待 delayed JS 或外链脚本 snippet refetch，并按 `tabId + url + epoch` 合并前台 in-flight；后台 enhancement 再等待 delayed JS、对当前页外链脚本做预算内 snippet refetch，并按 `tabId + url + pageFingerprint + epoch` 合并 in-flight 后覆盖内存缓存；
- `src/lib/technology-stack/scan-plan.ts` 从已加载的本地中性指纹包生成 full 页面扫描计划：全量下发当前规则声明的 DOM、JS chain、quick-token 加速规则与 HTML/text/CSS/脚本内容 pattern；
- `src/lib/technology-stack/detector.ts` 使用 Olyq 自研 TypeScript 规则引擎执行 confidence、version reliability、version conflict、implies/requires/requiresCategory/excludes 合并，不复制第三方扩展运行时代码；
- 规则包随扩展发版，本地 active 规则来自 `public/data/technology-fingerprints/fingerprint-rules.json`，运行时通过 `chrome.runtime.getURL(...)` 读取该扩展本地资产，不把规则数据内联进 Service Worker 主 chunk；覆盖率报告通过 `pnpm report:technology-stack-coverage` 生成，公开信号 smoke 矩阵通过 `pnpm smoke:technology-stack` 生成；
- UI 通过 `TechnologyStackPopover` 在页面上下文状态条附近展示结果，不再承担首次探测触发器；打开时优先读取页面生命周期已热缓存，兜底才发普通 fast-first 请求。fast 结果和后台 enhancement 结果都通过 UI Port 的易失 `technology-stack/result-updated` 刷新在线 UI，事件携带 SW epoch 派生的 `technologyStackPageKey`、内部 `enhanced` 标记与结构化结果，Popover 只按 pageKey 接受当前页面更新，不再用 `metadata.extractedAt` 和 `detectedAt` 猜测时序；该事件不进入 pending 队列，也不展示“部分信号”产品态；分类 header 和次级分类 chip 按 slug 走双语 locale。技术项图标由 Popover 读取扩展本地 `data/technology-icons/catalog.compact.json`，用 exact、JS 后缀和显式父品牌 key 查表后展开固定版本 jsDelivr SVG；不对任意技术动态拼 theSVG / simple-icons / devicon / material-icon-theme / skill-icons / Tabler 上游 URL，不读取上游远程 catalog，不做 URL 验证，不写 `chrome.storage` cache，也不消费 full/coverage/missing 审计报告。命中图标统一放在浅色中性安全 tile 中，不用深色黑底、`dark:invert` 或 CSS 改色修补第三方 SVG；品牌未命中时按分类使用 Tabler outline generic 图标并明确不冒充品牌 logo；catalog 未加载或图片加载失败时回到 Olyq 本地文字占位。自动上下文开启且 profile 含 `technology-stack` source 时，发送前按当前 pageKey 对该 source 等待 bounded enhancement，最多约 6500ms，超时使用 best-effort fast 结果，不根据用户输入文本做技术栈意图判断，最终只注入 `buildTechnologyStackPrompt()` 生成的安全摘要。

## 通信模型（最重要）

Chrome 扩展常用两种消息机制：

1. **Port（长连接）**：`chrome.runtime.connect` / `chrome.runtime.onConnect`
   - 用于：流式输出（chat/image delta）、保活、需要断线清理的请求
   - 本项目约定：
    - UI（Side Panel / Content Script 内联卡片）连接 `name="olyq:ui"`
     - Offscreen 连接 `name="olyq:offscreen"`

2. **sendMessage（一次性指令）**：`chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
   - 用于：划词/元素动作、内容脚本状态查询、Offscreen 创建等一次性后台指令

## 关键文件与职责

- `background/service-worker.ts`
  - 扩展“消息总线”与路由中心
  - 维护 `uiPorts`（多个 UI 页面可能同时在线）与 `offscreenPort`
  - 负责：
    - toolbar action：Chromium 通过 `sidePanel.setPanelBehavior` 直开 Side Panel，Firefox 通过 action click 调用 Sidebar
    - `offscreen/ensure`：创建 Offscreen Document（用于 embedding/WebGPU/DOM 解析等）
    - `chat/stream(-v1)`：把 UI 的聊天请求转发为真实流式输出并回写 delta
    - `image/generate`：文生图请求与回写
    - `browser-context/metadata/update`：跟随 active tab 推送轻量页面 metadata
    - `content-script/status/get` / `content-script/enabled/set` / `content-script/refresh`：静态注入模型下的状态与刷新探测
    - `technology-stack/*`：技术栈页面信号、网络信号、缓存、刷新和 UI 查询

- `bridge/ui-port.ts`
  - UI 侧 Port 单例封装（避免到处 connect + 分散监听）
  - 约束：协议弱类型，调用方需先判断 `msg.type` 再读 payload

- `content-script/index.ts`
  - 网页内统一 React Shadow root，承载划词助手、隐藏菜单、内联响应卡片和元素选择器；网页截图通过 `src/plugins/page-tools/screenshot-capture/` 插件挂载，root 只负责 Shadow host 与 ref 转交
  - 提供 `browser-context/getReadableDom` 等消息响应给 SW（用于按需正文采集）
  - 启动技术栈页面 ready reporter、页面信号采集，并注入最小 page-world bridge 读取 allowlist JS window chain

- `offscreen/runtime.ts`
  - Offscreen 运行时入口（由 `offscreen/index.html` 独立启动）
  - 精简运行时：仅维持与 SW 的连接（本地 OCR/本地 embedding 已移除）

## 调试建议

- 先看 `background/service-worker.ts`：它决定“消息从哪里来、到哪里去、何时清理”
- 再看 `bridge/ui-port.ts`：理解 UI 与 SW 的连接方式
- 最后按功能链路追：
  - 划词助手：`content-script/index.ts` → `sendMessage(selection/action)` → `service-worker.ts` → 主面板 UI
  - 在线向量化：UI → `embedding/generate` → `service-worker.ts` → Provider `/embeddings` → `embedding/result`
