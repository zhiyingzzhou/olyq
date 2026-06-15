import { docsContent } from './docsPageContent.js'

export const repoLinks = {
  releases: 'https://github.com/zzy/olyq/releases/latest',
  source: 'https://github.com/zzy/olyq',
  privacy: 'https://github.com/zzy/olyq/blob/main/PRIVACY.md',
  security: 'https://github.com/zzy/olyq/blob/main/SECURITY.md',
}

const productImage = (name) => `/product/${name}`

const providerNames = [
  'OpenAI',
  'Anthropic',
  'Gemini',
  'DeepSeek',
  'Mistral AI',
  'Groq',
  'xAI',
  'Cohere',
  'DashScope / Qwen',
  'SiliconFlow',
  'OpenRouter',
  'Vercel AI Gateway',
  'Azure OpenAI',
  'Vertex AI',
  'AWS Bedrock',
  'Ollama',
  'NewAPI / OpenAI-compatible',
]

const providerList = providerNames.join(', ')

const zhFooter = {
  cta: {
    titleLines: ['开源多模型客户端', '运行在浏览器侧边栏'],
    href: repoLinks.releases,
    label: '查看 GitHub Releases',
  },
  brand: {
    title: 'Olyq',
    tagline: '开源浏览器扩展，把网页、模型服务和常用工具放在同一个侧边栏。',
    cta: { href: repoLinks.source, label: '查看源码' },
  },
  newsletter: null,
  linkGroups: [
    {
      title: '内容',
      links: [
        { label: '文档', href: '/docs' },
      ],
    },
    {
      title: '项目',
      links: [
        { label: '源码', href: repoLinks.source },
        { label: 'Releases', href: repoLinks.releases },
        { label: '隐私', href: repoLinks.privacy },
        { label: '安全', href: repoLinks.security },
      ],
    },
    {
      title: '语言',
      links: [
        { label: '中文', href: '/' },
        { label: 'English', href: '/en' },
      ],
    },
  ],
  socialLinks: [
    { href: repoLinks.source, platform: 'github' },
  ],
  copyright: 'Olyq is open source software released under the MIT License.',
}

const enFooter = {
  ...zhFooter,
  cta: {
    titleLines: ['Open-source multi-model client', 'inside the browser sidebar'],
    href: repoLinks.releases,
    label: 'View GitHub Releases',
  },
  brand: {
    title: 'Olyq',
    tagline: 'An open-source browser extension for using your own models alongside the page you are reading.',
    cta: { href: repoLinks.source, label: 'View source' },
  },
  linkGroups: [
    {
      title: 'Content',
      links: [
        { label: 'Docs', href: '/en/docs' },
      ],
    },
    {
      title: 'Project',
      links: [
        { label: 'Source', href: repoLinks.source },
        { label: 'Releases', href: repoLinks.releases },
        { label: 'Privacy', href: repoLinks.privacy },
        { label: 'Security', href: repoLinks.security },
      ],
    },
    {
      title: 'Language',
      links: [
        { label: '中文', href: '/' },
        { label: 'English', href: '/en' },
      ],
    },
  ],
}

const buildHome = (locale) => {
  const isEn = locale === 'en'

  return {
    meta: {
      title: isEn
        ? 'Olyq | Open-source multi-model workspace for the browser'
        : 'Olyq | 浏览器里的开源多模型工作台',
      description: isEn
        ? 'Olyq connects your model platforms, page context, Paint, web tools, MCP, and local topics inside a browser sidebar.'
        : 'Olyq 把多种模型平台、网页上下文、Paint、网页工具、MCP 和本地话题放进浏览器侧边栏。',
    },
    hero: {
      eyebrow: isEn ? 'Open-source multi-model browser extension' : '开源多模型浏览器扩展',
      titleLines: isEn
        ? ['An open-source multi-model workspace', 'inside your browser']
        : ['浏览器里的开源多模型工作台', '接入模型、网页和工具'],
      titleSecondLead: isEn ? 'inside your' : '接入模型、网页和',
      titleAccent: isEn ? 'browser' : '工具',
      description: isEn
        ? 'Connect model platforms you already use, work with text and image models, compare outputs, and keep page context, screenshots, MCP results, and local topics in one sidebar.'
        : '接入你常用的模型平台，使用文本和图片模型，对比输出，并把网页材料、截图、MCP 结果和本地话题留在同一个侧边栏里。',
      image: productImage(isEn ? 'olyq-hero-page-context-en-light.png' : 'olyq-hero-page-context-zh-light.png'),
      imageDark: productImage(isEn ? 'olyq-hero-page-context-en-dark.png' : 'olyq-hero-page-context-zh-dark.png'),
      imageLight: productImage(isEn ? 'olyq-hero-page-context-en-light.png' : 'olyq-hero-page-context-zh-light.png'),
      imageAlt: isEn
        ? 'Olyq sidebar showing page context, assistant topics, and the chat composer.'
        : 'Olyq 侧边栏截图，展示页面上下文、助手话题和聊天输入区。',
      actions: [
        { href: repoLinks.releases, label: isEn ? 'Get Olyq' : '获取 Olyq' },
      ],
    },
    principles: {
      title: isEn ? 'A model workspace where the browser work happens' : '模型工作台就在浏览器里',
      items: [
        {
          title: isEn ? 'Manage model platforms' : '模型平台集中管理',
          body: isEn
            ? 'Keep providers, API keys, model choices, and per-topic generation settings close to the conversation.'
            : 'Provider、API Key、模型选择和话题参数都留在对话旁边。',
        },
        {
          title: isEn ? 'Use the page as material' : '网页材料按需进入话题',
          body: isEn
            ? 'Page text, selections, element references, screenshots, and OCR can join the topic only when needed.'
            : '页面正文、选区、元素引用、截图和 OCR 可以在需要时加入当前话题。',
        },
        {
          title: isEn ? 'Create with text and image models' : '文本和图片模型一起用',
          body: isEn
            ? 'Chat, model comparison, Paint, screenshots, OCR, search, and MCP tools share the same browser workspace.'
            : '对话、多模型对比、Paint、截图、OCR、搜索和 MCP 共用同一个浏览器工作区。',
        },
        {
          title: isEn ? 'Start from local state' : '结果和状态从本地开始',
          body: isEn
            ? 'Topics, messages, attachments, memory, Paint history, and backups begin in browser storage.'
            : '话题、消息、附件、记忆、Paint 历史和备份先从浏览器本地开始。',
        },
      ],
    },
    howItWorks: {
      eyebrow: isEn ? 'How it works' : '怎么用',
      title: isEn ? 'Connect platforms, choose context, keep working' : '接入平台，选择材料，继续当前话题',
      description: isEn
        ? 'Olyq treats model calls, page material, tools, and generated assets as parts of the same topic.'
        : 'Olyq 把模型调用、网页材料、工具结果和生成资产都归到同一个话题里。',
      tabs: [
        {
          id: 'workflow',
          title: isEn ? 'Connect model platforms' : '接入模型平台',
          description: isEn
            ? 'Add the providers and local runtimes you use, then choose models per topic or task.'
            : '添加你使用的云端平台和本地运行时，再按话题或任务选择模型。',
          graphic: {
            primary: {
              title: isEn ? 'Models' : '模型服务',
              subtitle: isEn ? 'API keys' : 'API Key',
              cta: isEn ? 'Model list' : '模型列表',
            },
            models: [
              {
                title: isEn ? 'Anthropic' : 'Anthropic',
                subtitle: isEn ? 'Claude' : 'Claude',
                cta: isEn ? 'Cloud' : '云端',
              },
              {
                title: isEn ? 'Ollama' : 'Ollama',
                subtitle: isEn ? 'Ollama' : 'Ollama',
                cta: isEn ? 'Local' : '本地',
              },
              {
                title: isEn ? 'OpenAI' : 'OpenAI',
                subtitle: isEn ? 'GPT' : 'GPT',
                cta: isEn ? 'Cloud' : '云端',
              },
            ],
          },
        },
        {
          id: 'tools',
          title: isEn ? 'Choose the model, tool, and page material' : '选择模型、工具和页面材料',
          description: isEn
            ? 'Run a single model, compare several models, attach page context, or bring in search and MCP tools.'
            : '可以单模型提问、多模型对比，也可以附加网页上下文、搜索和 MCP 工具。',
          graphic: {
            pageTitle: isEn ? 'Page task' : '网页任务',
            prompt: isEn
              ? 'Compare this doc section with two models, then keep the useful notes in this topic.'
              : '用两个模型看一下这段文档，把有用的结论留在这个话题里。',
            providersTitle: isEn ? 'Connected models' : '已连接模型',
            providersBadge: isEn ? 'ready' : '可用',
            providers: [
              { name: 'OpenAI', status: isEn ? 'Chat' : 'Chat' },
              { name: 'Anthropic', status: isEn ? 'Messages' : 'Messages' },
            ],
          },
        },
        {
          id: 'deploy',
          title: isEn ? 'Keep the result in the topic' : '沉淀到当前话题',
          description: isEn
            ? 'Messages, traces, screenshots, Paint assets, and backups stay connected to the task you are working on.'
            : '消息、过程、截图、Paint 资产和备份都跟着当前任务走。',
          graphic: {
            items: isEn
              ? [
                  { title: 'model-service', subtitle: 'API key', branch: 'sidebar', variant: 'default' },
                  { title: 'model-compare', subtitle: 'same prompt', branch: 'models', variant: 'success' },
                  { title: 'page-context', subtitle: 'current tab', branch: 'browser', variant: 'default' },
                  { title: 'screenshot-ocr', subtitle: 'attached', branch: 'web-tools', variant: 'default' },
                  { title: 'remote-mcp', subtitle: 'user enabled', branch: 'tools', variant: 'warning' },
                  { title: 'paint-workspace', subtitle: 'image model', branch: 'paint', variant: 'success' },
                  { title: 'local-backup', subtitle: 'browser state', branch: 'backup', variant: 'success' },
                  { title: 'web-search', subtitle: 'optional', branch: 'sources', variant: 'default' },
                  { title: 'webdav-backup', subtitle: 'optional', branch: 'backup', variant: 'warning' },
                  { title: 's3-backup', subtitle: 'optional', branch: 'backup', variant: 'warning' },
                  { title: 'sha256sums', subtitle: 'release check', branch: 'install', variant: 'success' },
                  { title: 'firefox-temp', subtitle: 'unsigned', branch: 'install', variant: 'default' },
                  { title: 'chromium-local', subtitle: 'unpacked', branch: 'install', variant: 'success' },
                ]
              : [
                  { title: '模型服务', subtitle: 'API Key', branch: '侧边栏', variant: 'default' },
                  { title: '多模型对比', subtitle: '同一问题', branch: '模型', variant: 'success' },
                  { title: '页面上下文', subtitle: '当前标签', branch: '浏览器', variant: 'default' },
                  { title: '截图 OCR', subtitle: '已附加', branch: '网页工具', variant: 'default' },
                  { title: '远程 MCP', subtitle: '用户启用', branch: '工具', variant: 'warning' },
                  { title: 'Paint 工作区', subtitle: '图片模型', branch: 'Paint', variant: 'success' },
                  { title: '本地备份', subtitle: '浏览器状态', branch: '备份', variant: 'success' },
                  { title: '联网搜索', subtitle: '可选', branch: '来源', variant: 'default' },
                  { title: 'WebDAV 备份', subtitle: '可选', branch: '备份', variant: 'warning' },
                  { title: 'S3 备份', subtitle: '可选', branch: '备份', variant: 'warning' },
                  { title: 'SHA256 校验', subtitle: 'Release 包', branch: '安装', variant: 'success' },
                  { title: 'Firefox 临时加载', subtitle: '未签名', branch: '安装', variant: 'default' },
                  { title: 'Chromium 本地加载', subtitle: '已解压', branch: '安装', variant: 'success' },
                ],
          },
        },
      ],
    },
    feature: {
      eyebrow: isEn ? 'Features' : '功能',
      title: isEn ? 'Model platforms, creation tools, and local topics' : '多模型平台、创作工具和本地话题',
      description: isEn
        ? 'The feature set is organized around model access, browser material, and a workspace you control.'
        : '能力围绕模型接入、浏览器材料和可控工作区展开。',
      lead: [
        {
          title: isEn ? 'Multi-model platforms' : '多模型平台',
          description: isEn
            ? 'Connect providers, manage API keys, switch models, tune topic parameters, and compare outputs.'
            : '接入 provider，管理 API Key，切换模型，调整话题参数，并对比输出。',
        },
        {
          title: isEn ? 'Creation and page tools' : '绘图、截图与网页工具',
          description: isEn
            ? 'Use Paint, screenshots, OCR, element references, search, MCP, and page context when the task needs them.'
            : '按任务使用 Paint、截图、OCR、元素引用、搜索、MCP 和页面上下文。',
        },
        {
          title: isEn ? 'Local topics and backups' : '本地话题与备份',
          description: isEn
            ? 'Keep topics, messages, attachments, memory, Paint history, and backup settings in browser state.'
            : '话题、消息、附件、记忆、Paint 历史和备份设置都从浏览器状态开始。',
        },
      ],
      capabilities: [
        {
          title: isEn ? 'Bring your own model platforms' : '接入自己的模型平台',
          description: isEn
            ? 'Use cloud providers, local runtimes, gateway services, and OpenAI-compatible endpoints with your own credentials.'
            : '使用云端 provider、本地运行时、网关服务和 OpenAI-compatible 端点，并使用你自己的凭据。',
          icon: 'one-click-auth',
        },
        {
          title: isEn ? 'Paint, search, MCP, and page tools' : 'Paint、搜索、MCP 与网页工具',
          description: isEn
            ? 'Generate images, inspect page material, capture screenshots, run OCR, and call configured tools.'
            : '生成图片，处理页面材料，截取截图，运行 OCR，并调用已配置的工具。',
          icon: 'realtime-sync',
        },
        {
          title: isEn ? 'Topic-first workspace' : '话题优先的工作区',
          description: isEn
            ? 'Keep model outputs, attachments, memories, Paint records, and backups tied to the topic you are working on.'
            : '模型输出、附件、记忆、Paint 记录和备份都围绕当前话题组织。',
          icon: 'custom-connector-sdk',
        },
      ],
      modelsPanel: {
        title: isEn ? 'Models' : '模型服务',
        badge: isEn ? 'connected' : '已连接',
        apiCard: {
          provider: 'OpenAI',
          keyLabel: isEn ? 'API key' : 'API Key',
          status: isEn ? 'Ready' : '可用',
        },
        models: [
          { name: 'Anthropic', icon: 'anthropic', status: isEn ? 'Messages' : 'Messages', tone: 'default' },
          { name: 'OpenAI', icon: 'openai', status: isEn ? 'Chat' : 'Chat', tone: 'success' },
          { name: isEn ? 'Ollama / Local' : 'Ollama / 本地', icon: 'local', status: isEn ? 'Local' : '本地', tone: 'warning' },
        ],
      },
      workflowPanel: {
        userLabel: isEn ? 'You' : '你',
        placeholder: isEn ? 'Ask with models, tools, and page material' : '带着模型、工具和页面材料提问',
        initialMessages: isEn
          ? [
              { role: 'user', content: 'Compare this page section with OpenAI and Claude.' },
              {
                role: 'assistant',
                content: 'I will use the same page material for both answers so the differences are easy to scan.',
              },
              { role: 'user', content: 'Also include the OCR result from this screenshot.' },
              { role: 'assistant', content: 'The screenshot text is now part of this topic, along with the page notes.' },
            ]
          : [
              { role: 'user', content: '用 OpenAI 和 Claude 对比这段页面内容。' },
              {
                role: 'assistant',
                content: '我会用同一份页面材料回答，方便你直接看差异。',
              },
              { role: 'user', content: '再带上这张截图的 OCR 结果。' },
              { role: 'assistant', content: '截图文字已经加入这个话题，会和页面笔记一起保留。' },
            ],
        replies: isEn
          ? [
              'Compare model answers without rebuilding the prompt in another tab.',
              'Search and MCP results can stay with the same topic.',
              'Selections, screenshots, and OCR text remain easy to revisit.',
              'Export your workspace or back it up when you need to move machines.',
            ]
          : [
              '不用换标签页重建提示词，也能对比多个模型的回答。',
              '搜索和 MCP 结果可以留在同一个话题里。',
              '选区、截图和 OCR 文字后面还可以继续追问。',
              '需要换设备时，可以导出工作区或配置远程备份。',
            ],
      },
      nativeToolsPanel: {
        tools: isEn
          ? ['Select model runtime', 'Attach page material', 'Call page tools']
          : ['选择模型运行时', '附加网页材料', '调用页面工具'],
        topicBadge: isEn ? 'Send request' : '发送请求',
      },
    },
    benefits: {
      eyebrow: isEn ? 'Developer workflows' : '开发者场景',
      title: isEn ? 'Use it where model work meets the page' : '模型工作和网页任务放在一起',
      description: isEn
        ? 'These are practical workflows Olyq supports today, without turning the browser into a hosted SaaS.'
        : '这些是 Olyq 当前支持的实际工作流，不把浏览器扩展写成托管 SaaS。',
      items: [
        {
          title: isEn ? 'Read technical docs' : '读技术文档',
          description: isEn ? 'Use the page text, selected snippets, and technology summary as evidence for the answer.' : '用页面正文、选区和技术栈摘要作为回答依据。',
          icon: 'rocket',
        },
        {
          title: isEn ? 'Compare model output' : '对比模型输出',
          description: isEn ? 'Send one prompt to several connected models and scan the differences in one topic.' : '同一个提示词发给多个已连接模型，在同一话题里看差异。',
          icon: 'shield',
        },
        {
          title: isEn ? 'Collect screenshot evidence' : '整理截图证据',
          description: isEn ? 'Mark a screenshot, mask private areas, run OCR, and attach the result to the topic.' : '标注截图、遮挡敏感区域、运行 OCR，再把结果附加到话题。',
          icon: 'spark',
        },
        {
          title: isEn ? 'Inspect page structure' : '分析网页结构',
          description: isEn ? 'Use readable text, style signals, page state, and technology summaries instead of raw DOM dumps.' : '使用可读正文、样式信号、页面状态和技术栈摘要，不把原始 DOM 塞进提示词。',
          icon: 'network',
        },
        {
          title: isEn ? 'Run image models' : '运行图片模型',
          description: isEn ? 'Use Paint for prompts, input images, provider options, output history, and later reuse.' : '用 Paint 管理提示词、输入图、provider 参数、输出历史和后续复用。',
          icon: 'chart',
        },
        {
          title: isEn ? 'Move local state' : '迁移本地状态',
          description: isEn ? 'Export settings, topics, messages, attachments, memory, and backups, or configure WebDAV / S3-compatible storage.' : '导出设置、话题、消息、附件、记忆和备份，或配置 WebDAV / S3-compatible 存储。',
          icon: 'repeat',
        },
      ],
      rotatingText: isEn
        ? ['Models connected', 'MCP tools attached', 'Workspace exported']
        : ['模型已连接', 'MCP 工具已附加', '工作区已导出'],
      showcase: {
        badge: isEn ? 'Current topic' : '当前话题',
        title: isEn ? 'Workspace' : '工作区',
        items: isEn
          ? [
              { label: 'Models', width: 85 },
              { label: 'MCP tools', width: 72 },
              { label: 'Local backup', width: 65 },
            ]
          : [
              { label: '模型服务', width: 85 },
              { label: 'MCP 工具', width: 72 },
              { label: '本地备份', width: 65 },
            ],
      },
    },
    useCases: {
      eyebrow: isEn ? 'Product surfaces' : '产品界面',
      title: isEn ? 'Real extension UI, not posters' : '真实扩展界面',
      description: isEn
        ? 'These screenshots come from the running extension: page context, model comparison, Paint, and web tools.'
        : '这些截图来自真实扩展界面：网页上下文、多模型对比、Paint 和网页工具。',
      items: [
        {
          title: isEn ? 'Page context' : '网页上下文',
          description: isEn ? 'Attach page text, selections, state, and references only when the task needs them.' : '只在任务需要时附加页面正文、选区、状态和引用。',
          imageLight: productImage(isEn ? 'olyq-page-context-en-light.png' : 'olyq-page-context-zh-light.png'),
          imageDark: productImage(isEn ? 'olyq-page-context-en-dark.png' : 'olyq-page-context-zh-dark.png'),
        },
        {
          title: isEn ? 'Model compare' : '多模型对比',
          description: isEn ? 'Compare connected models with the same prompt, attachments, and page material.' : '用同一提示词、附件和网页材料对比多个模型。',
          imageLight: productImage(isEn ? 'olyq-compare-en-light.png' : 'olyq-compare-zh-light.png'),
          imageDark: productImage(isEn ? 'olyq-compare-en-dark.png' : 'olyq-compare-zh-dark.png'),
        },
        {
          title: 'Paint',
          description: isEn ? 'Run image models with prompts, input images, provider options, and result history.' : '用提示词、输入图、provider 参数和历史结果运行图片模型。',
          imageLight: productImage(isEn ? 'olyq-paint-en-light.png' : 'olyq-paint-zh-light.png'),
          imageDark: productImage(isEn ? 'olyq-paint-en-dark.png' : 'olyq-paint-zh-dark.png'),
        },
        {
          title: isEn ? 'Web tools' : '网页工具',
          description: isEn ? 'Use selection, element picker, screenshots, OCR, and markup from the current page.' : '从当前页面使用选区、元素点选、截图、OCR 和标注。',
          imageLight: productImage(isEn ? 'olyq-web-tools-en-light.png' : 'olyq-web-tools-zh-light.png'),
          imageDark: productImage(isEn ? 'olyq-web-tools-en-dark.png' : 'olyq-web-tools-zh-dark.png'),
        },
      ],
    },
    getOlyq: {
      eyebrow: isEn ? 'Get Olyq' : '获取 Olyq',
      title: isEn ? 'Install from the current release build' : '从当前 Release 构建安装',
      description: isEn
        ? 'Current builds are distributed through GitHub Releases for local loading. Choose the path that matches your browser and workflow.'
        : '当前构建通过 GitHub Releases 分发，用于本地加载。根据你的浏览器和工作方式选择安装路径。',
      primaryAction: { href: repoLinks.releases, label: isEn ? 'Open GitHub Releases' : '打开 GitHub Releases' },
      paths: [
        {
          title: 'Chrome / Chromium',
          description: isEn ? 'Local unpacked extension for Chromium-based browsers.' : '适用于 Chromium 系浏览器的本地已解压扩展加载。',
          ctaText: isEn ? 'Download release' : '下载 Release',
          ctaLink: repoLinks.releases,
          steps: isEn
            ? ['Download the Chromium zip from GitHub Releases', 'Unzip it locally', 'Open chrome://extensions', 'Enable Developer mode', 'Load the unpacked directory']
            : ['从 GitHub Releases 下载 Chromium zip', '解压到本地目录', '打开 chrome://extensions', '启用开发者模式', '加载已解压的扩展目录'],
        },
        {
          title: 'Firefox',
          description: isEn ? 'Temporary unsigned add-on for local review in Firefox.' : '适用于 Firefox 本地检查的未签名临时扩展。',
          ctaText: isEn ? 'Download release' : '下载 Release',
          ctaLink: repoLinks.releases,
          steps: isEn
            ? ['Download the Firefox addon zip from GitHub Releases', 'Unzip it locally', 'Open about:debugging', 'Load manifest.json', 'Temporary add-ons are removed after restart']
            : ['从 GitHub Releases 下载 Firefox addon zip', '解压到本地目录', '打开 about:debugging', '临时载入 manifest.json', '临时扩展会在浏览器重启后失效'],
        },
        {
          title: isEn ? 'Source build' : '源码构建',
          description: isEn ? 'For contributors who want to inspect and build from source.' : '适合需要审阅源码并本地构建的贡献者。',
          ctaText: isEn ? 'View source' : '查看源码',
          ctaLink: repoLinks.source,
          steps: isEn
            ? ['Clone the public repository', 'Install with pnpm', 'Run the extension build commands', 'Use SHA256SUMS from releases for packaged builds', 'Store listings are not claimed yet']
            : ['克隆公开仓库', '使用 pnpm 安装依赖', '运行扩展构建命令', 'Release 包可用 SHA256SUMS 校验', '当前不宣称已有商店上架'],
        },
      ],
    },
    faq: {
      eyebrow: isEn ? 'FAQs' : '常见问题',
      items: [
        {
          question: isEn ? 'Does Olyq host AI models?' : 'Olyq 会托管 AI 模型吗？',
          answer: isEn
            ? 'No. You add model services and API keys yourself. Model calls go to the services you configure.'
            : '不会。你自己添加模型服务和 API Key。模型调用会发往你配置的服务。',
        },
        {
          question: isEn ? 'Can Olyq use image models?' : 'Olyq 支持图片模型吗？',
          answer: isEn
            ? 'Yes. Paint uses configured image-capable providers and keeps prompts, input images, provider options, and generated results in the workspace.'
            : '支持。Paint 使用你配置的图片模型能力，并把提示词、输入图、provider 参数和生成结果保存在工作区里。',
        },
        {
          question: isEn ? 'Which model providers can Olyq work with?' : 'Olyq 能接哪些模型平台？',
          answer: isEn
            ? `${providerList}. Available models still depend on your account, API key, and service settings.`
            : `${providerList}。实际可用模型取决于你的账号、API Key 和服务设置。`,
        },
        {
          question: isEn ? 'Is there a Chrome Web Store or AMO listing?' : '现在有 Chrome Web Store 或 AMO 上架吗？',
          answer: isEn
            ? 'Not yet. Current builds are distributed through GitHub Releases for local loading.'
            : '还没有。当前构建通过 GitHub Releases 分发，用于本地加载。',
        },
        {
          question: isEn ? 'Where is data stored by default?' : '数据默认存在哪里？',
          answer: isEn
            ? 'Settings, topics, messages, attachments, memory, and backups start in browser storage. External services are used only when you configure and invoke them.'
            : '设置、话题、消息、附件、记忆和备份默认保存在浏览器本地。只有配置并使用外部服务时，相关数据才会发送出去。',
        },
        {
          question: isEn ? 'What browser material can Olyq use?' : 'Olyq 能给模型哪些网页材料？',
          answer: isEn
            ? 'Depending on the mode, it can use page text, selections, element references, screenshots, OCR text, style signals, technology summaries, search results, and MCP tool results.'
            : '根据模式不同，它可以使用页面正文、选区、元素引用、截图、OCR 文本、样式信号、技术栈摘要、搜索结果和 MCP 工具结果。',
        },
      ],
    },
    footer: isEn ? enFooter : zhFooter,
  }
}

export const localizedContent = {
  zh: {
    home: buildHome('zh'),
    nav: {
      brandHref: '/',
      links: [
        { label: '开源与隐私', href: '/open-source-privacy' },
        { label: '文档', href: '/docs' },
      ],
      cta: { label: '获取 Olyq', href: repoLinks.releases },
      language: {
        ariaLabel: 'Switch to English',
        href: '/en',
        label: 'EN',
        shortLabel: 'EN',
      },
    },
    notFound: {
      meta: { title: '404 | Olyq' },
      actions: [{ href: '/', label: '回到首页' }],
      description: '这个页面不存在，或者已经从旧官网结构中移除。',
      title: '404',
    },
    docs: docsContent.zh,
  },
  en: {
    home: buildHome('en'),
    nav: {
      brandHref: '/en',
      links: [
        { label: 'Open source & privacy', href: '/en/open-source-privacy' },
        { label: 'Docs', href: '/en/docs' },
      ],
      cta: { label: 'Get Olyq', href: repoLinks.releases },
      language: {
        ariaLabel: '切换到中文',
        href: '/',
        label: '中文',
        shortLabel: '中',
      },
    },
    notFound: {
      meta: { title: '404 | Olyq' },
      actions: [{ href: '/en', label: 'Back home' }],
      description: 'This page does not exist, or it was removed with the old website structure.',
      title: '404',
    },
    docs: docsContent.en,
  },
}

export const siteContent = localizedContent.zh
