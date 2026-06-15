const productImage = (name) => `/product/${name}`

const zhImages = {
  hero: {
    alt: 'Olyq 侧边栏中的网页上下文话题',
    dark: productImage('olyq-hero-page-context-zh-dark.png'),
    light: productImage('olyq-hero-page-context-zh-light.png'),
  },
  pageContext: {
    alt: 'Olyq 网页上下文截图',
    dark: productImage('olyq-page-context-zh-dark.png'),
    light: productImage('olyq-page-context-zh-light.png'),
  },
  compare: {
    alt: 'Olyq 多模型对比截图',
    dark: productImage('olyq-compare-zh-dark.png'),
    light: productImage('olyq-compare-zh-light.png'),
  },
  paint: {
    alt: 'Olyq Paint 工作区截图',
    dark: productImage('olyq-paint-zh-dark.png'),
    light: productImage('olyq-paint-zh-light.png'),
  },
  webTools: {
    alt: 'Olyq 网页工具截图',
    dark: productImage('olyq-web-tools-zh-dark.png'),
    light: productImage('olyq-web-tools-zh-light.png'),
  },
  quickStartSidebar: {
    alt: 'Olyq 侧边栏打开后的主工作区',
    caption: '侧边栏打开后，顶部会显示当前网页状态，底部是当前话题输入区。',
    dark: productImage('olyq-docs-quick-start-sidebar-zh-dark.png'),
    light: productImage('olyq-docs-quick-start-sidebar-zh-light.png'),
  },
  modelPlatformsSettings: {
    alt: 'Olyq 模型管理设置页',
    caption: '模型管理页展示已连接的平台、连接配置和模型列表。',
    dark: productImage('olyq-docs-model-platforms-settings-zh-dark.png'),
    light: productImage('olyq-docs-model-platforms-settings-zh-light.png'),
  },
  modelCompare: {
    alt: 'Olyq 多模型对比话题',
    caption: '多模型对比会把同一轮问题的多个模型回答放在同一个话题里。',
    dark: productImage('olyq-docs-model-compare-zh-dark.png'),
    light: productImage('olyq-docs-model-compare-zh-light.png'),
  },
  browserContextBar: {
    alt: 'Olyq PageContextBar 显示当前网页',
    caption: 'PageContextBar 必须显示当前页面标题或 host，才表示侧边栏绑定到了可采集网页。',
    dark: productImage('olyq-docs-browser-context-bar-zh-dark.png'),
    light: productImage('olyq-docs-browser-context-bar-zh-light.png'),
  },
  pageToolsTrace: {
    alt: 'Olyq 网页工具 trace 与附件',
    caption: '截图、OCR 和元素引用会作为当前话题材料或 trace 记录出现。',
    dark: productImage('olyq-docs-page-tools-trace-zh-dark.png'),
    light: productImage('olyq-docs-page-tools-trace-zh-light.png'),
  },
  paintWorkspace: {
    alt: 'Olyq Paint 图片工作区',
    caption: 'Paint 工作区独立承载图片模型、提示词、输入图和生成历史。',
    dark: productImage('olyq-docs-paint-workspace-zh-dark.png'),
    light: productImage('olyq-docs-paint-workspace-zh-light.png'),
  },
  webSearchSettings: {
    alt: 'Olyq 联网搜索设置页',
    caption: '联网搜索配置决定搜索结果是否能进入当前轮回答材料。',
    dark: productImage('olyq-docs-web-search-settings-zh-dark.png'),
    light: productImage('olyq-docs-web-search-settings-zh-light.png'),
  },
  mcpSettings: {
    alt: 'Olyq remote MCP 设置页',
    caption: 'MCP 设置页只维护 remote MCP server 和工具调用配置。',
    dark: productImage('olyq-docs-mcp-settings-zh-dark.png'),
    light: productImage('olyq-docs-mcp-settings-zh-light.png'),
  },
  localBackupSettings: {
    alt: 'Olyq 本地与远程备份设置页',
    caption: '备份设置页包含本地导出、WebDAV 和 S3-compatible 存储入口。',
    dark: productImage('olyq-docs-local-backup-settings-zh-dark.png'),
    light: productImage('olyq-docs-local-backup-settings-zh-light.png'),
  },
}

const enImages = {
  hero: {
    alt: 'Olyq sidebar with a page-context topic',
    dark: productImage('olyq-hero-page-context-en-dark.png'),
    light: productImage('olyq-hero-page-context-en-light.png'),
  },
  pageContext: {
    alt: 'Olyq page context screenshot',
    dark: productImage('olyq-page-context-en-dark.png'),
    light: productImage('olyq-page-context-en-light.png'),
  },
  compare: {
    alt: 'Olyq model comparison screenshot',
    dark: productImage('olyq-compare-en-dark.png'),
    light: productImage('olyq-compare-en-light.png'),
  },
  paint: {
    alt: 'Olyq Paint workspace screenshot',
    dark: productImage('olyq-paint-en-dark.png'),
    light: productImage('olyq-paint-en-light.png'),
  },
  webTools: {
    alt: 'Olyq web tools screenshot',
    dark: productImage('olyq-web-tools-en-dark.png'),
    light: productImage('olyq-web-tools-en-light.png'),
  },
  quickStartSidebar: {
    alt: 'Olyq sidebar workspace after opening',
    caption: 'After the sidebar opens, the top bar shows the current page state and the composer stays at the bottom of the topic.',
    dark: productImage('olyq-docs-quick-start-sidebar-en-dark.png'),
    light: productImage('olyq-docs-quick-start-sidebar-en-light.png'),
  },
  modelPlatformsSettings: {
    alt: 'Olyq model manager settings',
    caption: 'The model manager shows connected platforms, connection settings, and model lists.',
    dark: productImage('olyq-docs-model-platforms-settings-en-dark.png'),
    light: productImage('olyq-docs-model-platforms-settings-en-light.png'),
  },
  modelCompare: {
    alt: 'Olyq model comparison topic',
    caption: 'Model comparison keeps several model replies for the same prompt inside one topic.',
    dark: productImage('olyq-docs-model-compare-en-dark.png'),
    light: productImage('olyq-docs-model-compare-en-light.png'),
  },
  browserContextBar: {
    alt: 'Olyq PageContextBar with the current page',
    caption: 'PageContextBar should show the page title or host before you rely on page material.',
    dark: productImage('olyq-docs-browser-context-bar-en-dark.png'),
    light: productImage('olyq-docs-browser-context-bar-en-light.png'),
  },
  pageToolsTrace: {
    alt: 'Olyq web tools trace and attachment',
    caption: 'Screenshots, OCR, and element references appear as topic material or trace records.',
    dark: productImage('olyq-docs-page-tools-trace-en-dark.png'),
    light: productImage('olyq-docs-page-tools-trace-en-light.png'),
  },
  paintWorkspace: {
    alt: 'Olyq Paint image workspace',
    caption: 'Paint keeps image models, prompts, input images, and generation history in a dedicated workspace.',
    dark: productImage('olyq-docs-paint-workspace-en-dark.png'),
    light: productImage('olyq-docs-paint-workspace-en-light.png'),
  },
  webSearchSettings: {
    alt: 'Olyq web search settings',
    caption: 'Web search settings decide whether search results can enter the current answer round.',
    dark: productImage('olyq-docs-web-search-settings-en-dark.png'),
    light: productImage('olyq-docs-web-search-settings-en-light.png'),
  },
  mcpSettings: {
    alt: 'Olyq remote MCP settings',
    caption: 'The MCP settings page manages remote MCP servers and tool invocation configuration.',
    dark: productImage('olyq-docs-mcp-settings-en-dark.png'),
    light: productImage('olyq-docs-mcp-settings-en-light.png'),
  },
  localBackupSettings: {
    alt: 'Olyq local and remote backup settings',
    caption: 'Backup settings contain local export, WebDAV, and S3-compatible storage entries.',
    dark: productImage('olyq-docs-local-backup-settings-en-dark.png'),
    light: productImage('olyq-docs-local-backup-settings-en-light.png'),
  },
}

const makeGuide = (guide) => guide

const zhGuides = [
  makeGuide({
    slug: 'quick-start',
    group: '快速开始',
    title: '安装并打开 Olyq',
    summary: '从 GitHub Releases 下载构建包，在浏览器里本地加载扩展，然后打开侧边栏。',
    image: zhImages.quickStartSidebar,
    prerequisites: ['Chrome / Chromium 或 Firefox', '从 GitHub Releases 下载对应构建包', '浏览器允许本地加载扩展'],
    sections: [
      {
        title: '安装 Chrome / Chromium 构建',
        steps: [
          '打开 GitHub Releases，下载 Chromium 构建包。',
          '把 zip 解压到一个固定目录，不要直接从临时下载目录加载。',
          '打开 `chrome://extensions`。',
          '启用开发者模式。',
          '点击“加载已解压的扩展程序”，选择解压后的目录。',
        ],
      },
      {
        title: '安装 Firefox 临时构建',
        steps: [
          '从 GitHub Releases 下载 Firefox addon zip，并解压到本地目录。',
          '打开 `about:debugging`。',
          '选择“此 Firefox”。',
          '点击“临时载入附加组件”，选择扩展目录里的 `manifest.json`。',
          '注意：临时扩展会在 Firefox 重启后失效。',
        ],
      },
      {
        title: '打开侧边栏',
        image: zhImages.quickStartSidebar,
        steps: [
          '点击浏览器工具栏里的 Olyq 图标。',
          'Chromium 会打开浏览器原生 Side Panel。',
          'Firefox 会打开扩展自己的侧边栏页面。',
          '看到聊天输入区、话题列表和设置入口后，安装就完成了。',
        ],
      },
      {
        title: '你应该看到什么',
        body: '初次打开时，Olyq 只是一个空工作区。它不会自带托管模型，也不会替你选择模型服务。下一步需要添加模型平台。',
      },
    ],
    next: ['model-platforms', 'browser-context'],
  }),
  makeGuide({
    slug: 'model-platforms',
    group: '模型工作台',
    title: '添加模型平台和模型',
    summary: '把你已有的 provider、API Key 和模型列表接入 Olyq。Olyq 不托管模型。',
    image: zhImages.modelPlatformsSettings,
    prerequisites: ['一个可用的模型平台账号', '该平台的 API Key 或本地运行时地址', '知道你要使用文本模型还是图片模型'],
    sections: [
      {
        title: '进入模型管理',
        image: zhImages.modelPlatformsSettings,
        steps: [
          '打开 Olyq 侧边栏。',
          '进入设置。',
          '打开模型相关面板。',
          '选择要添加的平台，例如 OpenAI、Anthropic、Gemini、DeepSeek、OpenRouter、Ollama 或其它已支持平台。',
        ],
      },
      {
        title: '填写连接信息',
        image: zhImages.modelPlatformsSettings,
        steps: [
          '填入 API Key。不同平台的鉴权 header 由 Olyq 按 provider 契约处理。',
          '如果平台需要 Region、Deployment、Service Account 或专用 Base URL，按面板提示填写。',
          '保存后刷新或拉取模型列表。',
          '选择默认文本模型。需要 Paint 时，再选择支持图片生成的模型。',
        ],
      },
      {
        title: '检查模型是否可用',
        steps: [
          '在模型详情里运行健康检查。',
          '如果失败，先看错误详情里的 endpoint、provider 和模型 ID。',
          '确认 API Key 不是把 URL 当成密钥填入。',
          '本地 Ollama 需要本机运行时已经启动。',
        ],
      },
      {
        title: '边界',
        body: '模型是否可用取决于你的账号、API Key、服务区域和模型权限。Olyq 只负责把请求发给你配置的服务。',
      },
    ],
    next: ['model-compare', 'paint'],
  }),
  makeGuide({
    slug: 'model-compare',
    group: '模型工作台',
    title: '对比多个模型的回答',
    summary: '用同一个问题、同一份网页材料和附件，让多个已连接模型一起回答。',
    image: zhImages.modelCompare,
    prerequisites: ['至少添加两个可用文本模型', '当前话题里已有问题或网页材料'],
    sections: [
      {
        title: '选择要对比的模型',
        image: zhImages.modelCompare,
        steps: [
          '在聊天输入区或话题设置里选择模型。',
          '打开多模型对比。',
          '勾选这轮要参与回答的模型。',
          '保持同一份提示词、附件和网页上下文。',
        ],
      },
      {
        title: '发送同一个问题',
        image: zhImages.modelCompare,
        steps: [
          '输入问题。',
          '如果需要页面材料，确认自动上下文已开启。',
          '发送后，每个模型会在同一组回答里输出。',
          '横向对比时，每列可以单独滚动，也可以同步阅读进度。',
        ],
      },
      {
        title: '适合什么场景',
        points: [
          '读技术文档时，看哪个模型遗漏了页面细节。',
          '改写内容时，比较表达风格。',
          '核验结论时，看不同模型是否给出相反判断。',
        ],
      },
      {
        title: '边界',
        body: '对比不是投票机制。它只是把多个模型的回答放在同一话题里，方便你判断差异。',
      },
    ],
    next: ['browser-context', 'web-search-mcp'],
  }),
  makeGuide({
    slug: 'browser-context',
    group: '浏览器工作流',
    title: '把当前网页作为上下文',
    summary: '让模型按需读取当前网页、选区、元素引用、截图、OCR、技术栈摘要和样式信号。',
    image: zhImages.browserContextBar,
    prerequisites: ['当前标签页是普通 http/https 网页', 'Olyq 侧边栏已打开', '当前话题允许自动上下文'],
    sections: [
      {
        title: '确认页面状态',
        image: zhImages.browserContextBar,
        steps: [
          '打开你要阅读或分析的网页。',
          '打开 Olyq 侧边栏。',
          '查看顶部 PageContextBar 是否显示当前页面标题或域名。',
          '如果状态显示不可用，刷新页面或切回普通网页再试。',
        ],
      },
      {
        title: '选择上下文模式',
        steps: [
          '普通阅读先使用默认页面正文模式。',
          '需要完整页面时，切到全文模式。',
          '需要视觉或设计分析时，开启风格模式。',
          '不想带页面材料时，关闭自动上下文。',
        ],
      },
      {
        title: '发送问题',
        image: zhImages.browserContextBar,
        steps: [
          '在当前话题里提问。',
          'Olyq 会在发送前收集当前模式需要的材料。',
          '回答里的 trace 会显示使用过的页面材料、工具或附件。',
          '后续追问会继续留在同一个话题里。',
        ],
      },
      {
        title: '边界',
        body: '受登录墙、浏览器限制、PDF、空页面、canvas 页面或不可注入 iframe 影响时，Olyq 可能只能拿到 metadata。它不会跨源穿透 iframe DOM。',
      },
    ],
    next: ['page-tools', 'model-compare'],
  }),
  makeGuide({
    slug: 'page-tools',
    group: '浏览器工作流',
    title: '使用截图、OCR 和元素引用',
    summary: '从网页触发选区、元素点选、截图标注和 OCR，再把结果送进当前话题。',
    image: zhImages.pageToolsTrace,
    prerequisites: ['当前页面允许 Olyq 页面工具运行', '浏览器已授予扩展普通网页访问能力', '如果要 OCR，需要配置可用视觉模型'],
    sections: [
      {
        title: '选中文本或元素',
        image: zhImages.pageToolsTrace,
        steps: [
          '在网页里选中文本，使用 Olyq 的页面动作。',
          '需要定位具体区域时，打开元素选择器。',
          '确认后，选区或元素引用会进入侧边栏。',
          '继续追问时，模型会看到这份引用材料。',
        ],
      },
      {
        title: '截图和标注',
        image: zhImages.pageToolsTrace,
        steps: [
          '从页面工具启动截图。',
          '框选区域。',
          '按需要画箭头、标注或遮挡敏感信息。',
          '选择发送到侧边栏后，截图会作为附件进入当前话题。',
        ],
      },
      {
        title: 'OCR',
        steps: [
          '在截图工具里触发 OCR。',
          'Olyq 会调用你配置的视觉模型。',
          'OCR 结果先显示在页面浮层里。',
          '需要继续追问时，再把结果送进侧边栏。',
        ],
      },
      {
        title: '边界',
        body: 'OCR 不是默认进入话题的动作。它先在页面侧返回文本，只有你明确继续处理时才进入侧边栏。',
      },
    ],
    next: ['browser-context', 'paint'],
  }),
  makeGuide({
    slug: 'paint',
    group: '创作与工具',
    title: '使用 Paint 图片工作区',
    summary: '用支持图片生成的模型处理提示词、输入图、provider 参数和生成历史。',
    image: zhImages.paintWorkspace,
    prerequisites: ['至少添加一个支持图片生成的 provider', '选择一个可用图片模型', '准备提示词，必要时准备输入图'],
    sections: [
      {
        title: '打开 Paint',
        image: zhImages.paintWorkspace,
        steps: [
          '打开 Olyq 启动台。',
          '选择“绘画 / Paint”。',
          '在左侧设置区选择图片模型。',
          '在底部输入提示词。',
        ],
      },
      {
        title: '设置生成参数',
        image: zhImages.paintWorkspace,
        steps: [
          '选择尺寸、数量、质量或 provider 支持的参数。',
          '需要图生图时，添加输入图片。',
          '高级 providerOptions 只填写该 provider 支持的 namespace。',
          '标准字段不要在高级 JSON 里重复覆盖。',
        ],
      },
      {
        title: '生成和复用',
        steps: [
          '点击生成。',
          '结果会进入 Paint 历史。',
          '保留的输入图和输出图属于工作区资产。',
          '需要迁移时，使用备份或导出流程。',
        ],
      },
      {
        title: '边界',
        body: 'Paint 不提供内置免费图片模型。它使用你已经配置并有权限调用的图片模型服务。',
      },
    ],
    next: ['model-platforms', 'local-backup'],
  }),
  makeGuide({
    slug: 'web-search-mcp',
    group: '创作与工具',
    title: '使用联网搜索和 remote MCP',
    summary: '把搜索结果和你配置的 MCP 工具作为当前话题的可选材料。',
    image: zhImages.webSearchSettings,
    prerequisites: ['已配置文本模型', '需要搜索时启用搜索 provider', '需要 MCP 时添加 remote MCP server'],
    sections: [
      {
        title: '联网搜索',
        image: zhImages.webSearchSettings,
        steps: [
          '进入设置里的联网搜索配置。',
          '选择本地搜索 provider 或模型内置搜索能力。',
          '如果同时选择外部搜索 provider 和模型内置搜索，外部搜索优先。',
          '发送问题后，搜索结果会作为当前轮材料进入回答。',
        ],
      },
      {
        title: 'remote MCP',
        image: zhImages.mcpSettings,
        steps: [
          '进入 MCP 设置。',
          '添加 remote MCP server。',
          '需要 OAuth 的服务，按授权流程完成登录。',
          '在助手或话题里允许 MCP tools 后，再发送需要工具的请求。',
        ],
      },
      {
        title: '工具结果在哪里',
        body: '工具调用过程会进入消息 trace。它服务当前话题，不会变成独立的外部工作流。',
      },
      {
        title: '边界',
        body: 'Olyq 当前文档只写 remote MCP。不要把桌面端 stdio MCP、本地自动安装 uv/bun 或 Cherry Studio 的 MCP 流程套到 Olyq 上。',
      },
    ],
    next: ['model-platforms', 'local-backup'],
  }),
  makeGuide({
    slug: 'local-backup',
    group: '本地工作区',
    title: '管理话题、附件和备份',
    summary: '了解哪些数据默认留在浏览器里，以及如何导出或配置 WebDAV / S3-compatible 备份。',
    image: zhImages.localBackupSettings,
    prerequisites: ['已经创建过话题或 Paint 记录', '需要迁移时准备本地目录、WebDAV 或 S3-compatible 存储'],
    sections: [
      {
        title: '默认保存在哪里',
        points: [
          '话题、消息和附件默认在浏览器本地状态里。',
          'Paint 历史和图片资产属于工作区数据。',
          '全局记忆存储在 IndexedDB。',
          '模型服务、搜索、MCP 和远程备份只在你配置并使用时访问外部服务。',
        ],
      },
      {
        title: '导出或备份',
        image: zhImages.localBackupSettings,
        steps: [
          '打开文件或备份相关入口。',
          '选择本地导出，或配置 WebDAV / S3-compatible 存储。',
          '需要完整迁移时使用 full 备份。',
          '只保留结构化状态、不带大文件时使用 lite 备份。',
        ],
      },
      {
        title: '恢复',
        steps: [
          '选择明确的备份版本。',
          '确认恢复会覆盖当前工作区状态。',
          '恢复后刷新或重新打开侧边栏。',
          '检查话题、消息、附件和 Paint 记录是否符合预期。',
        ],
      },
      {
        title: '边界',
        body: '远程备份不是托管账号同步。它只把备份写入你配置的 WebDAV 或 S3-compatible 位置。',
      },
    ],
    next: ['quick-start', 'model-platforms'],
  }),
]

const enGuides = [
  makeGuide({
    slug: 'quick-start',
    group: 'Quick start',
    title: 'Install and open Olyq',
    summary: 'Download a release build, load it locally in the browser, then open the sidebar.',
    image: enImages.quickStartSidebar,
    prerequisites: ['Chrome / Chromium or Firefox', 'A matching build from GitHub Releases', 'Local extension loading enabled in the browser'],
    sections: [
      {
        title: 'Install the Chrome / Chromium build',
        steps: [
          'Open GitHub Releases and download the Chromium build.',
          'Unzip it into a stable local directory.',
          'Open `chrome://extensions`.',
          'Enable Developer mode.',
          'Load the unpacked extension directory.',
        ],
      },
      {
        title: 'Install the Firefox temporary build',
        steps: [
          'Download the Firefox addon zip from GitHub Releases and unzip it locally.',
          'Open `about:debugging`.',
          'Choose “This Firefox”.',
          'Load `manifest.json` from the extension directory.',
          'Temporary add-ons are removed after Firefox restarts.',
        ],
      },
      {
        title: 'Open the sidebar',
        image: enImages.quickStartSidebar,
        steps: [
          'Click the Olyq toolbar icon.',
          'Chromium opens the browser Side Panel.',
          'Firefox opens the extension sidebar page.',
          'When you see the composer, topics, and settings entry, installation is done.',
        ],
      },
      {
        title: 'What you should see',
        body: 'The first run is an empty workspace. Olyq does not host models or choose a provider for you. Add a model platform next.',
      },
    ],
    next: ['model-platforms', 'browser-context'],
  }),
  makeGuide({
    slug: 'model-platforms',
    group: 'Model workspace',
    title: 'Add model platforms and models',
    summary: 'Connect the providers, API keys, and models you already use. Olyq does not host models.',
    image: enImages.modelPlatformsSettings,
    prerequisites: ['A model provider account or local runtime', 'An API key or runtime endpoint', 'A decision on text models, image models, or both'],
    sections: [
      {
        title: 'Open model management',
        image: enImages.modelPlatformsSettings,
        steps: [
          'Open the Olyq sidebar.',
          'Open settings.',
          'Go to the model panel.',
          'Choose a platform such as OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama, or another supported provider.',
        ],
      },
      {
        title: 'Fill in connection details',
        image: enImages.modelPlatformsSettings,
        steps: [
          'Enter the API key. Olyq handles provider-specific auth headers from the provider contract.',
          'If the platform needs a region, deployment, service account, or base URL, fill in the provider-specific fields.',
          'Save and refresh the model list.',
          'Choose a default text model. For Paint, also choose an image-capable model.',
        ],
      },
      {
        title: 'Check availability',
        steps: [
          'Run the model health check.',
          'If it fails, inspect the endpoint, provider, and model ID in the error details.',
          'Make sure the API key field does not contain a URL.',
          'For local Ollama, make sure the local runtime is running.',
        ],
      },
      {
        title: 'Boundary',
        body: 'Model availability depends on your account, API key, region, and model permissions. Olyq only sends requests to services you configured.',
      },
    ],
    next: ['model-compare', 'paint'],
  }),
  makeGuide({
    slug: 'model-compare',
    group: 'Model workspace',
    title: 'Compare multiple model replies',
    summary: 'Ask several connected models the same question with the same page material and attachments.',
    image: enImages.modelCompare,
    prerequisites: ['At least two working text models', 'A topic with a question or page material'],
    sections: [
      {
        title: 'Choose models',
        image: enImages.modelCompare,
        steps: [
          'Select models from the composer or topic settings.',
          'Open model comparison.',
          'Choose the models for this round.',
          'Keep the same prompt, attachments, and page context.',
        ],
      },
      {
        title: 'Send one question',
        image: enImages.modelCompare,
        steps: [
          'Type the question.',
          'If page material is needed, keep automatic context enabled.',
          'Each model replies inside the same answer group.',
          'In horizontal comparison, each column can scroll while keeping progress aligned.',
        ],
      },
      {
        title: 'Good uses',
        points: [
          'Check which model missed details from a technical page.',
          'Compare writing style for a rewrite.',
          'Look for conflicting conclusions before making a decision.',
        ],
      },
      {
        title: 'Boundary',
        body: 'Comparison is not a voting system. It keeps model replies together so you can judge the differences.',
      },
    ],
    next: ['browser-context', 'web-search-mcp'],
  }),
  makeGuide({
    slug: 'browser-context',
    group: 'Browser workflow',
    title: 'Use the current page as context',
    summary: 'Let models use page text, selections, element references, screenshots, OCR, technology summaries, and style signals when needed.',
    image: enImages.browserContextBar,
    prerequisites: ['The active tab is an ordinary http/https page', 'The Olyq sidebar is open', 'Automatic context is enabled for the topic'],
    sections: [
      {
        title: 'Check page state',
        image: enImages.browserContextBar,
        steps: [
          'Open the page you want to read or inspect.',
          'Open the Olyq sidebar.',
          'Check whether PageContextBar shows the page title or host.',
          'If the state is unavailable, refresh the page or switch to an ordinary web page.',
        ],
      },
      {
        title: 'Choose context mode',
        steps: [
          'Use the default readable-page mode for normal reading.',
          'Switch to full-page mode when the task needs more material.',
          'Enable style mode for visual or design analysis.',
          'Disable automatic context when the question should not include page material.',
        ],
      },
      {
        title: 'Ask the question',
        image: enImages.browserContextBar,
        steps: [
          'Ask in the current topic.',
          'Olyq collects the material required by the current mode before sending.',
          'The answer trace shows page material, tools, or attachments used in the round.',
          'Follow-up questions stay in the same topic.',
        ],
      },
      {
        title: 'Boundary',
        body: 'Login walls, browser restrictions, PDFs, empty pages, canvas-heavy pages, or inaccessible iframes can limit collection. Olyq does not pierce cross-origin iframe DOM.',
      },
    ],
    next: ['page-tools', 'model-compare'],
  }),
  makeGuide({
    slug: 'page-tools',
    group: 'Browser workflow',
    title: 'Use screenshots, OCR, and element references',
    summary: 'Trigger selection, element picking, screenshot markup, and OCR from the page, then continue in the topic.',
    image: enImages.pageToolsTrace,
    prerequisites: ['Page tools are enabled for the current site', 'The browser has granted ordinary page access to the extension', 'OCR requires a working vision model'],
    sections: [
      {
        title: 'Select text or an element',
        image: enImages.pageToolsTrace,
        steps: [
          'Select text on the page and use the Olyq page action.',
          'Use the element picker when you need a specific source area.',
          'Confirm the selection or element reference.',
          'The material enters the sidebar topic for follow-up work.',
        ],
      },
      {
        title: 'Capture and mark up a screenshot',
        image: enImages.pageToolsTrace,
        steps: [
          'Start screenshot capture from page tools.',
          'Select the region.',
          'Add arrows, notes, or masks if needed.',
          'Send it to the sidebar so the screenshot becomes a topic attachment.',
        ],
      },
      {
        title: 'Run OCR',
        steps: [
          'Trigger OCR from the screenshot tool.',
          'Olyq calls the vision model you configured.',
          'The OCR result appears in the page overlay first.',
          'Send it to the sidebar only when you want to keep working with it.',
        ],
      },
      {
        title: 'Boundary',
        body: 'OCR does not automatically enter the topic. It first returns text on the page; you decide whether to continue in the sidebar.',
      },
    ],
    next: ['browser-context', 'paint'],
  }),
  makeGuide({
    slug: 'paint',
    group: 'Creation and tools',
    title: 'Use the Paint image workspace',
    summary: 'Run image-capable models with prompts, input images, provider options, and generation history.',
    image: enImages.paintWorkspace,
    prerequisites: ['At least one image-capable provider', 'A selected image model', 'A prompt, and optionally input images'],
    sections: [
      {
        title: 'Open Paint',
        image: enImages.paintWorkspace,
        steps: [
          'Open the Olyq launchpad.',
          'Choose Paint.',
          'Select an image model in the settings panel.',
          'Enter the prompt in the composer.',
        ],
      },
      {
        title: 'Set generation parameters',
        image: enImages.paintWorkspace,
        steps: [
          'Choose size, count, quality, or supported provider parameters.',
          'Add input images for image-to-image tasks.',
          'Use advanced providerOptions only for namespaces supported by that provider.',
          'Do not repeat standard fields in advanced JSON.',
        ],
      },
      {
        title: 'Generate and reuse',
        steps: [
          'Start generation.',
          'Generated images enter Paint history.',
          'Input and output images are workspace assets.',
          'Use backup or export when moving to another machine.',
        ],
      },
      {
        title: 'Boundary',
        body: 'Paint does not include free image models. It uses the image model services you configured and can access.',
      },
    ],
    next: ['model-platforms', 'local-backup'],
  }),
  makeGuide({
    slug: 'web-search-mcp',
    group: 'Creation and tools',
    title: 'Use web search and remote MCP',
    summary: 'Bring search results and configured MCP tools into the current topic when the task needs them.',
    image: enImages.webSearchSettings,
    prerequisites: ['A working text model', 'A search provider if search is needed', 'A remote MCP server if tools are needed'],
    sections: [
      {
        title: 'Web search',
        image: enImages.webSearchSettings,
        steps: [
          'Open web search settings.',
          'Choose a local search provider or a provider-hosted search capability.',
          'If an external search provider and native model search are both selected, external search wins.',
          'When you ask, search results become material for the current round.',
        ],
      },
      {
        title: 'Remote MCP',
        image: enImages.mcpSettings,
        steps: [
          'Open MCP settings.',
          'Add a remote MCP server.',
          'Complete OAuth authorization if the server requires it.',
          'Allow MCP tools for the assistant or topic before sending a tool-based request.',
        ],
      },
      {
        title: 'Where tool results go',
        body: 'Tool calls are recorded in the message trace. They serve the current topic instead of becoming a separate workflow.',
      },
      {
        title: 'Boundary',
        body: 'These docs only describe remote MCP for Olyq. Do not apply desktop stdio MCP, local uv/bun installation, or Cherry Studio MCP flows to Olyq.',
      },
    ],
    next: ['model-platforms', 'local-backup'],
  }),
  makeGuide({
    slug: 'local-backup',
    group: 'Local workspace',
    title: 'Manage topics, attachments, and backups',
    summary: 'Understand what starts in browser storage, and how to export or configure WebDAV / S3-compatible backup.',
    image: enImages.localBackupSettings,
    prerequisites: ['Existing topics or Paint records', 'A local directory, WebDAV, or S3-compatible storage when migration is needed'],
    sections: [
      {
        title: 'Where data starts',
        points: [
          'Topics, messages, and attachments start in browser storage.',
          'Paint history and image assets belong to workspace data.',
          'Global memory is stored in IndexedDB.',
          'Model services, search, MCP, and remote backup are contacted only when configured and invoked.',
        ],
      },
      {
        title: 'Export or back up',
        image: enImages.localBackupSettings,
        steps: [
          'Open the files or backup area.',
          'Choose local export, or configure WebDAV / S3-compatible storage.',
          'Use full backup when you need a complete move.',
          'Use lite backup when you only need structured state without large files.',
        ],
      },
      {
        title: 'Restore',
        steps: [
          'Choose an explicit backup version.',
          'Confirm that restore replaces the current workspace state.',
          'Refresh or reopen the sidebar after restore.',
          'Check topics, messages, attachments, and Paint records.',
        ],
      },
      {
        title: 'Boundary',
        body: 'Remote backup is not hosted account sync. It writes archives to the WebDAV or S3-compatible location you configure.',
      },
    ],
    next: ['quick-start', 'model-platforms'],
  }),
]

const buildGroups = (guides) => (
  guides.reduce((groups, guide) => {
    const existing = groups.find((group) => group.title === guide.group)
    if (existing) {
      existing.guides.push(guide.slug)
    } else {
      groups.push({ title: guide.group, guides: [guide.slug] })
    }
    return groups
  }, [])
)

export const docsContent = {
  zh: {
    meta: {
      description: 'Olyq 使用文档：安装、模型平台、网页上下文、Paint、MCP、搜索和备份教程。',
      title: '文档 | Olyq',
    },
    hero: {
      eyebrow: 'Docs',
      title: 'Olyq 使用文档',
      description: '按真实扩展界面写的教程。先接模型平台，再把网页材料、工具和结果放进同一个话题。',
    },
    labels: {
      boundary: '边界',
      beforeStart: '开始前',
      next: '下一步',
      nav: '文档',
      startHere: '从这里开始',
      tableOfContents: '本页目录',
    },
    groups: buildGroups(zhGuides),
    guides: zhGuides,
  },
  en: {
    meta: {
      description: 'Olyq docs for installation, model platforms, page context, Paint, MCP, search, and backup.',
      title: 'Docs | Olyq',
    },
    hero: {
      eyebrow: 'Docs',
      title: 'Olyq docs',
      description: 'Guides written against the real extension UI: connect model platforms, then keep page material, tools, and results in one topic.',
    },
    labels: {
      boundary: 'Boundary',
      beforeStart: 'Before you start',
      next: 'Next',
      nav: 'Docs',
      startHere: 'Start here',
      tableOfContents: 'On this page',
    },
    groups: buildGroups(enGuides),
    guides: enGuides,
  },
}
