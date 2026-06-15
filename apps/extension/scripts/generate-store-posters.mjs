import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStoreAssetFontCss } from './store-asset-fonts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');
const outputDir = path.join(repoRoot, 'assets/product');
const iconPath = path.join(extensionRoot, 'public/icons/olyq-512.png');
const viewport = { width: 1280, height: 800 };
const modelBrandIconCdnBase = 'https://unpkg.com/@lobehub/icons-static-webp@latest';

const langs = ['zh', 'en'];

const modelBrandIconSpecs = {
  openai: { id: 'openai', hasColor: false },
  claude: { id: 'claude', hasColor: true },
  gemini: { id: 'gemini', hasColor: true },
};

const modelBrandIconDataUris = new Map();
let storeAssetFontCss = '';

const scenes = [
  {
    index: '01',
    slug: 'page-context',
    layout: 'pageContext',
    title: { zh: '让回答引用当前网页', en: 'Answers that cite the page' },
    subtitle: {
      zh: '正文、选区、截图一起进对话，输出结论、证据和待确认项。',
      en: 'Turn page text, selection, and screenshots into cited findings.',
    },
    pageTitle: { zh: '结账页上线复盘', en: 'Checkout launch review' },
    question: {
      zh: '按“结论 / 页面证据 / 风险 / 下一步”整理这页。',
      en: 'Organize this page into findings, page evidence, risks, and next steps.',
    },
    answerTitle: { zh: '页面材料支持的判断', en: 'Grounded answer from the tab' },
    bullets: {
      zh: ['先处理支付失败恢复，再调整表单文案。', '页面证据：完成率 +5.6%，但 34% 工单集中在费用步骤。', '还要确认：企业采购流程和失败重试入口。'],
      en: ['Fix payment recovery before rewriting the form.', 'Page evidence: +5.6% completion, but 34% of tickets mention the fee step.', 'Confirm next: procurement flow and retry entry.'],
    },
    chips: { zh: ['页面正文', '选中文本', '截图线索'], en: ['Page text', 'Selection', 'Screenshot clue'] },
  },
  {
    index: '02',
    slug: 'compare',
    layout: 'compare',
    title: { zh: '同一问题，三种模型一起看', en: 'One question, three model reads' },
    subtitle: {
      zh: '适合复盘、合同、研究结论这类不能只听一个答案的场景。',
      en: 'Useful for launch reviews, clauses, and research notes where one answer is not enough.',
    },
    prompt: {
      zh: '根据页面数据，下一步优先改哪里？',
      en: 'Based on this page, what should we fix first?',
    },
    note: {
      zh: '把共识、分歧和缺少的证据分开看，最后仍由你判断。',
      en: 'Consensus, disagreement, and missing evidence stay visible for your call.',
    },
    columns: {
      zh: [
        { icon: 'openai', name: 'GPT-5.5', stance: '先改费用说明', note: '收益已经出现，但费用步骤仍是主要投诉来源。' },
        { icon: 'claude', name: 'Claude Opus 4.8', stance: '先补失败恢复', note: '15 分钟锁定会阻断付款，比文案更影响转化。' },
        { icon: 'gemini', name: 'Gemini 3 Pro', stance: '先加监控验证', note: '缺少分组样本，扩大改版前先补事件埋点。' },
      ],
      en: [
        { icon: 'openai', name: 'GPT-5.5', stance: 'Rewrite fee copy', note: 'The lift is real, but the fee step is still the main complaint source.' },
        { icon: 'claude', name: 'Claude Opus 4.8', stance: 'Fix failed recovery', note: 'The 15-minute lock can block checkout more than wording does.' },
        { icon: 'gemini', name: 'Gemini 3 Pro', stance: 'Instrument first', note: 'Add event tracking before widening the redesign.' },
      ],
    },
  },
  {
    index: '03',
    slug: 'paint',
    layout: 'paint',
    title: { zh: '从网页结论生成视觉草稿', en: 'Draft visuals from page findings' },
    subtitle: {
      zh: '把页面里的指标、风险和受众带到 Paint，不用重新整理提示词。',
      en: 'Carry metrics, risks, and audience notes into Paint without rebuilding the prompt.',
    },
    prompt: {
      zh: '基于 +5.6% 完成率、34% 费用工单和 15 分钟锁定，做一张产品评审图。',
      en: 'Create a product-review visual with +5.6% completion, 34% fee tickets, and the 15-minute lock.',
    },
  },
  {
    index: '04',
    slug: 'web-tools',
    layout: 'webTools',
    title: { zh: '截图、OCR、元素都能追问', en: 'Ask about captures, OCR, and elements' },
    subtitle: {
      zh: '框选页面区域后，截图标注、识别文字和 DOM 元素会一起送进侧边栏。',
      en: 'Select part of a page and send the markup, recognized text, and DOM element together.',
    },
    quote: {
      zh: 'OCR：费用提示、失败恢复、15 分钟锁定出现在同一区域。',
      en: 'OCR: fee notice, failed recovery, and the 15-minute lock appear in the same area.',
    },
  },
  {
    index: '05',
    slug: 'local-first',
    layout: 'localFirst',
    title: { zh: '先保存在浏览器本地', en: 'Stored in your browser first' },
    subtitle: {
      zh: '话题、附件和模型设置默认留在本机；外连只发生在你启用对应能力时。',
      en: 'Topics, files, and model settings stay local unless you enable a connected feature.',
    },
    nodes: {
      zh: ['话题', '附件', '模型设置', '本地备份'],
      en: ['Topics', 'Files', 'Model settings', 'Local backup'],
    },
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fileDataUri(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function buildModelBrandIconUrl(icon) {
  const spec = modelBrandIconSpecs[icon];
  if (!spec) throw new Error(`Unknown model brand icon: ${icon}`);
  const suffix = spec.hasColor ? '-color' : '';
  return `${modelBrandIconCdnBase}/light/${spec.id}${suffix}.webp`;
}

async function fetchDataUri(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load model brand icon ${url}: HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || 'image/webp';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Model brand icon is empty: ${url}`);
  }
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function loadModelBrandIcons() {
  const icons = new Set(scenes.flatMap((scene) => scene.columns ? scene.columns.zh.map((column) => column.icon) : []));
  for (const icon of icons) {
    modelBrandIconDataUris.set(icon, await fetchDataUri(buildModelBrandIconUrl(icon)));
  }
}

function outputName(lang, scene) {
  return `olyq-store-${lang}-${scene.index}-${scene.slug}.png`;
}

function expectedPosterNames() {
  return langs.flatMap((lang) => scenes.map((scene) => outputName(lang, scene))).sort();
}

function cleanStorePosters() {
  for (const name of fs.readdirSync(outputDir)) {
    if (/^olyq-store-.*\.png$/.test(name)) {
      fs.unlinkSync(path.join(outputDir, name));
    }
  }
}

function collectChineseFontSubsetText() {
  const values = [];
  for (const scene of scenes) {
    values.push(scene.title.zh, scene.subtitle.zh);
    for (const key of ['pageTitle', 'question', 'answerTitle', 'prompt', 'note', 'quote']) {
      if (scene[key]?.zh) values.push(scene[key].zh);
    }
    if (scene.bullets?.zh) values.push(...scene.bullets.zh);
    if (scene.chips?.zh) values.push(...scene.chips.zh);
    if (scene.columns?.zh) {
      for (const column of scene.columns.zh) {
        values.push(column.stance, column.note);
      }
    }
    if (scene.nodes?.zh) values.push(...scene.nodes.zh);
  }
  values.push(
    'Olyq当前页面图片模型输出尺寸画质生成记录条记录从对话带来的提示词风险说明图给产品评审使用当前结账页标注截图发送到侧边栏选中元素侧边栏会同时收到截图文本和元素选择本地工作区消息附件和设置先留在浏览器外连是显式选择模型搜索远程备份',
  );
  return Array.from(new Set(values.join(''))).join('');
}

async function loadStoreAssetFonts() {
  storeAssetFontCss = await buildStoreAssetFontCss({
    includeChinese: true,
    chineseText: collectChineseFontSubsetText(),
  });
}

function logoMarkup() {
  return `<img class="brand-icon" src="${fileDataUri(iconPath)}" alt=""><span class="wordmark">Olyq</span>`;
}

function sparkle() {
  return '<span class="sparkle" aria-hidden="true"></span>';
}

function modelBrandIconMarkup(icon) {
  const dataUri = modelBrandIconDataUris.get(icon);
  if (!dataUri) throw new Error(`Model brand icon was not loaded: ${icon}`);
  return `<span class="model-brand-mark" aria-hidden="true"><img src="${dataUri}" alt=""></span>`;
}

function browserDots() {
  return '<span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>';
}

function chipList(chips) {
  return chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
}

function pageContextScene(scene, lang) {
  const bullets = scene.bullets[lang]
    .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
    .join('');
  return `
    <section class="copy copy-left page-context-copy">
      <h1>${escapeHtml(scene.title[lang])}</h1>
      <p>${escapeHtml(scene.subtitle[lang])}</p>
    </section>
    <section class="page-context-stage product-stage">
      <div class="browser-window article-window">
        <div class="browser-top">${browserDots()}<span>${escapeHtml(scene.pageTitle[lang])}</span></div>
        <div class="article-body">
          <strong>${escapeHtml(scene.pageTitle[lang])}</strong>
          <p></p><p></p><p class="short"></p>
          <div class="highlight-line"></div>
          <p></p><p class="wide"></p>
        </div>
      </div>
      <div class="side-panel answer-panel">
        <div class="panel-head">
          <span class="mini-logo">${logoMarkup()}</span>
          <span class="model-pill">GPT-5.5</span>
        </div>
        <div class="context-bar">${chipList(scene.chips[lang])}</div>
        <div class="question-card">${escapeHtml(scene.question[lang])}</div>
        <div class="tool-row"><span></span>browser_context.read_page</div>
        <div class="tool-row"><span></span>web_search</div>
        <h2>${escapeHtml(scene.answerTitle[lang])}</h2>
        <ul>${bullets}</ul>
      </div>
    </section>`;
}

function compareScene(scene, lang) {
  const columns = scene.columns[lang]
    .map(
      (column, index) => `
        <article class="compare-card card-${index}">
          <div class="compare-head">
            ${modelBrandIconMarkup(column.icon)}
            <strong>${escapeHtml(column.name)}</strong>
          </div>
          <h3>${escapeHtml(column.stance)}</h3>
          <p>${escapeHtml(column.note)}</p>
          <div class="skeleton s1"></div>
          <div class="skeleton s2"></div>
        </article>`,
    )
    .join('');
  return `
    <section class="copy copy-top">
      <h1>${escapeHtml(scene.title[lang])}</h1>
      <p>${escapeHtml(scene.subtitle[lang])}</p>
    </section>
    <section class="compare-stage product-stage">
      <div class="prompt-ribbon">${sparkle()}<span>${escapeHtml(scene.prompt[lang])}</span></div>
      <div class="compare-grid">${columns}</div>
      <div class="compare-note">${escapeHtml(scene.note[lang])}</div>
    </section>`;
}

function paintScene(scene, lang) {
  return `
    <section class="copy copy-top paint-copy">
      <h1>${escapeHtml(scene.title[lang])}</h1>
      <p>${escapeHtml(scene.subtitle[lang])}</p>
    </section>
    <section class="paint-stage product-stage">
      <div class="paint-sidebar">
        <span>${escapeHtml(lang === 'zh' ? '图片模型' : 'Image model')}</span>
        <strong>GPT Image 2</strong>
        <span>${escapeHtml(lang === 'zh' ? '输出尺寸' : 'Output size')}</span>
        <strong>1024×1024</strong>
        <span>${escapeHtml(lang === 'zh' ? '画质' : 'Quality')}</span>
        <strong>high</strong>
        <div class="input-thumb"></div>
      </div>
      <div class="canvas-card">
        <div class="poster-art">
          <div class="sun"></div>
          <div class="hill hill-a"></div>
          <div class="hill hill-b"></div>
          <div class="glass-report">
            <strong>${escapeHtml(lang === 'zh' ? '风险说明图' : 'Risk summary')}</strong>
            <span>${escapeHtml(lang === 'zh' ? '给产品评审使用' : 'For product review')}</span>
            <div><i></i><i></i><i></i></div>
          </div>
          <div class="metric-chip">+5.6%</div>
        </div>
      </div>
      <div class="history-card">
        <strong>${escapeHtml(lang === 'zh' ? '生成记录' : 'Generated')}</strong>
        <span>${escapeHtml(lang === 'zh' ? '1 条记录' : '1 record')}</span>
        <div class="history-item">
          <div></div>
          <p>${escapeHtml(lang === 'zh' ? '结账页风险说明图' : 'Checkout risk visual')}</p>
        </div>
      </div>
      <div class="prompt-card">
        <strong>${escapeHtml(lang === 'zh' ? '从对话带来的提示词' : 'Prompt carried from chat')}</strong>
        <p>${escapeHtml(scene.prompt[lang])}</p>
      </div>
    </section>`;
}

function webToolsScene(scene, lang) {
  return `
    <section class="copy copy-top tools-copy">
      <h1>${escapeHtml(scene.title[lang])}</h1>
      <p>${escapeHtml(scene.subtitle[lang])}</p>
    </section>
    <section class="tools-stage product-stage">
      <div class="browser-window web-page">
        <div class="browser-top">${browserDots()}<span>${escapeHtml(lang === 'zh' ? '当前结账页' : 'Current checkout page')}</span></div>
        <div class="page-lines"><p></p><p></p><p class="short"></p></div>
        <div class="selection-box">
          <span>${escapeHtml(lang === 'zh' ? '+5.6% 完成率' : '+5.6% completion')}</span>
          <span>${escapeHtml(lang === 'zh' ? '34% 工单' : '34% tickets')}</span>
        </div>
        <div class="tool-strip">${escapeHtml(lang === 'zh' ? '标注截图' : 'Mark screenshot')} · OCR · ${escapeHtml(lang === 'zh' ? '发送到侧边栏' : 'Send to sidebar')}</div>
      </div>
      <div class="ocr-card">
        <strong>OCR</strong>
        <p>${escapeHtml(scene.quote[lang])}</p>
      </div>
      <div class="element-card">
        <strong>${escapeHtml(lang === 'zh' ? '选中元素' : 'Selected element')}</strong>
        <span>button.checkout.primary</span>
      </div>
      <div class="mini-chat-card">
        <span class="mini-logo">${logoMarkup()}</span>
        <p>${escapeHtml(lang === 'zh' ? '侧边栏会同时收到截图、OCR 文本和元素选择。' : 'The sidebar receives the screenshot, OCR text, and selected element together.')}</p>
      </div>
    </section>`;
}

function localFirstScene(scene, lang) {
  const nodes = scene.nodes[lang]
    .map((node, index) => `<span class="privacy-node node-${index}">${escapeHtml(node)}</span>`)
    .join('');
  return `
    <section class="copy copy-left local-copy">
      <h1>${escapeHtml(scene.title[lang])}</h1>
      <p>${escapeHtml(scene.subtitle[lang])}</p>
    </section>
    <section class="privacy-stage product-stage">
      <div class="local-core">
        <span class="core-logo">${logoMarkup()}</span>
        <strong>${escapeHtml(lang === 'zh' ? '本地工作区' : 'Local workspace')}</strong>
        <p>${escapeHtml(lang === 'zh' ? '消息、附件和设置先留在浏览器' : 'Messages, files, and settings start in the browser')}</p>
      </div>
      <div class="privacy-nodes">${nodes}</div>
      <svg class="privacy-lines" viewBox="0 0 620 500" aria-hidden="true">
        <path d="M310 250 C214 168 154 128 112 104" />
        <path d="M310 250 C426 160 488 124 526 106" />
        <path d="M310 250 C188 272 132 318 104 382" />
        <path d="M310 250 C432 276 500 322 542 384" />
        <path d="M310 250 C310 348 310 408 310 462" />
      </svg>
      <div class="boundary-card">
        <strong>${escapeHtml(lang === 'zh' ? '外连是显式选择' : 'External access is explicit')}</strong>
        <span>${escapeHtml(lang === 'zh' ? '模型 API · 搜索 · MCP · 远程备份' : 'Model APIs · Search · MCP · Remote backup')}</span>
      </div>
    </section>`;
}

function sceneMarkup(scene, lang) {
  if (scene.layout === 'pageContext') return pageContextScene(scene, lang);
  if (scene.layout === 'compare') return compareScene(scene, lang);
  if (scene.layout === 'paint') return paintScene(scene, lang);
  if (scene.layout === 'webTools') return webToolsScene(scene, lang);
  if (scene.layout === 'localFirst') return localFirstScene(scene, lang);
  throw new Error(`Unknown layout: ${scene.layout}`);
}

function posterHtml({ scene, lang }) {
  const isZh = lang === 'zh';
  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <style>
    ${storeAssetFontCss}
    * { box-sizing: border-box; }
    html, body { width: 1280px; height: 800px; margin: 0; overflow: hidden; }
    body {
      color: #05070f;
      background: #fbfdff;
      font-family: ${isZh ? '"Noto Sans SC", ' : ''}"Sora", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-feature-settings: "kern" 1;
      text-rendering: geometricPrecision;
    }
    .stage {
      position: relative;
      width: 1280px;
      height: 800px;
      overflow: hidden;
      isolation: isolate;
      background:
        radial-gradient(circle at 82% 18%, rgba(205, 250, 255, .82), transparent 34%),
        radial-gradient(circle at 30% 86%, rgba(255, 231, 247, .76), transparent 37%),
        radial-gradient(circle at 58% 76%, rgba(219, 224, 255, .62), transparent 34%),
        linear-gradient(115deg, #ffffff 0%, #fcfbff 48%, #eefeff 100%);
    }
    .stage::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      background-image:
        linear-gradient(90deg, rgba(18, 31, 54, .026) 1px, transparent 1px),
        linear-gradient(rgba(18, 31, 54, .022) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(circle at 62% 62%, black 0%, transparent 76%);
    }
    .brand {
      position: absolute;
      top: 44px;
      left: 68px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 11px;
      color: rgba(5, 7, 15, .78);
      font-family: "Sora", sans-serif;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -.015em;
    }
    .brand-icon {
      width: 34px;
      height: 34px;
      display: block;
      border-radius: 9px;
      box-shadow: 0 12px 30px rgba(0, 163, 217, .20);
    }
    .mini-logo,
    .core-logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #0b1220;
      font-size: 18px;
      font-weight: 760;
    }
    .wordmark {
      font-family: "Sora", sans-serif;
      font-weight: 800;
      letter-spacing: -.018em;
    }
    .mini-logo .brand-icon { width: 25px; height: 25px; border-radius: 7px; box-shadow: none; }
    .core-logo .brand-icon { width: 58px; height: 58px; border-radius: 16px; }
    h1 {
      margin: 0;
      color: #05070f;
      font-family: ${isZh ? '"Noto Sans SC", ' : ''}"Sora", sans-serif;
      font-size: ${isZh ? 62 : 56}px;
      line-height: ${isZh ? '1.18' : '1.12'};
      letter-spacing: ${isZh ? '.018em' : '0'};
      font-weight: 800;
      text-wrap: balance;
    }
    h2, h3, p { margin: 0; }
    .copy {
      position: absolute;
      z-index: 4;
    }
    .copy p {
      margin-top: 22px;
      color: rgba(20, 29, 48, .68);
      font-size: ${isZh ? 24 : 22}px;
      line-height: ${isZh ? '1.50' : '1.44'};
      font-weight: 500;
      letter-spacing: ${isZh ? '.006em' : '0'};
    }
    .copy-left {
      left: 86px;
      top: 190px;
      width: ${isZh ? 470 : 410}px;
    }
    .page-context-copy {
      left: 56px;
      width: ${isZh ? 390 : 395}px;
    }
    .copy-top {
      left: 100px;
      right: 100px;
      top: 108px;
      text-align: center;
    }
    .copy-top h1 { font-size: ${isZh ? 58 : 50}px; }
    .copy-top p {
      max-width: 830px;
      margin-left: auto;
      margin-right: auto;
    }
    .product-stage {
      position: absolute;
      z-index: 2;
    }
    .browser-window,
    .side-panel,
    .compare-card,
    .paint-sidebar,
    .canvas-card,
    .history-card,
    .prompt-card,
    .ocr-card,
    .element-card,
    .mini-chat-card,
    .local-core,
    .boundary-card {
      background: rgba(255, 255, 255, .84);
      border: 1px solid rgba(203, 213, 225, .86);
      box-shadow: 0 26px 72px rgba(99, 116, 152, .16);
      backdrop-filter: blur(18px);
    }
    .browser-window { border-radius: 18px; overflow: hidden; }
    .browser-top {
      height: 44px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      color: rgba(15, 23, 42, .60);
      font-size: 13px;
      font-weight: 760;
      background: rgba(248, 250, 252, .92);
      border-bottom: 1px solid rgba(226, 232, 240, .84);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      flex: 0 0 auto;
    }
    .red { background: #ff5f57; }
    .yellow { background: #ffbd2e; }
    .green { background: #28c840; margin-right: 8px; }
    .sparkle {
      display: inline-block;
      width: 22px;
      height: 27px;
      border-radius: 7px;
      background:
        radial-gradient(circle at 32% 22%, #ff4fa3 0 21%, transparent 22%),
        radial-gradient(circle at 70% 28%, #ffb445 0 18%, transparent 19%),
        radial-gradient(circle at 34% 72%, #6d5cff 0 22%, transparent 23%),
        radial-gradient(circle at 75% 73%, #9b5cff 0 21%, transparent 22%);
      box-shadow: 0 10px 22px rgba(124, 58, 237, .20);
    }

    .page-context-stage {
      left: 500px;
      top: 88px;
      width: 700px;
      height: 650px;
    }
    .article-window {
      position: absolute;
      left: 0;
      top: 96px;
      width: 430px;
      height: 402px;
      transform: rotate(-1.8deg);
    }
    .article-body {
      padding: 24px 30px;
    }
    .article-body strong {
      display: block;
      margin-bottom: 16px;
      font-size: 21px;
      line-height: 1.3;
      font-weight: 860;
    }
    .article-body p,
    .page-lines p,
    .skeleton {
      height: 16px;
      border-radius: 999px;
      background: #eef2f7;
    }
    .article-body p { margin: 13px 0; }
    .article-body .short { width: 62%; }
    .article-body .wide { width: 88%; }
    .highlight-line {
      width: 100%;
      height: 42px;
      margin: 18px 0;
      border-radius: 14px;
      background: linear-gradient(90deg, rgba(0, 217, 163, .18), rgba(0, 163, 217, .15));
      border: 1px solid rgba(0, 163, 217, .18);
    }
    .answer-panel {
      position: absolute;
      right: 0;
      top: 42px;
      width: 390px;
      min-height: 545px;
      padding: 22px;
      border-radius: 22px;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .model-pill {
      padding: 7px 11px;
      border-radius: 999px;
      color: #31506b;
      font-size: 12px;
      font-weight: 850;
      background: #eef7ff;
      border: 1px solid rgba(0, 163, 217, .14);
    }
    .context-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .context-bar span {
      padding: 7px 10px;
      border-radius: 999px;
      color: #0f766e;
      font-size: ${isZh ? 13 : 12}px;
      font-weight: 780;
      background: rgba(236, 253, 245, .96);
      border: 1px solid rgba(20, 184, 166, .20);
    }
    .question-card {
      padding: 14px 16px;
      border-radius: 15px;
      color: #172033;
      font-size: ${isZh ? 16 : 15}px;
      line-height: 1.45;
      font-weight: 720;
      background: #f8fafc;
      border: 1px solid #e5edf6;
    }
    .tool-row {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 34px;
      margin-top: 10px;
      padding: 0 12px;
      color: #516178;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      border-radius: 999px;
      background: #fff;
      border: 1px solid #e5edf6;
    }
    .tool-row span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #16a34a;
      box-shadow: 0 0 0 4px rgba(22, 163, 74, .10);
    }
    .answer-panel h2 {
      margin-top: 18px;
      color: #07101f;
      font-size: ${isZh ? 19 : 18}px;
      line-height: 1.25;
      font-weight: 820;
    }
    .answer-panel ul {
      margin: 13px 0 0;
      padding-left: 20px;
      color: #263449;
      font-size: ${isZh ? 15 : 14}px;
      line-height: 1.56;
      font-weight: 620;
    }
    .answer-panel li { margin: 8px 0; }
    .compare-stage {
      left: 58px;
      right: 58px;
      bottom: 46px;
      height: 452px;
      border-radius: 26px;
    }
    .prompt-ribbon {
      position: absolute;
      left: 210px;
      top: -22px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 520px;
      padding: 18px 24px;
      border-radius: 24px;
      color: #0c1222;
      font-size: ${isZh ? 24 : 21}px;
      font-weight: 820;
      background: rgba(255, 255, 255, .92);
      border: 1px solid rgba(220, 226, 238, .96);
      box-shadow: 0 18px 46px rgba(99, 116, 152, .15);
    }
    .compare-grid {
      position: absolute;
      inset: 58px 30px 58px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
    }
    .compare-card {
      border-radius: 20px;
      padding: 24px;
    }
    .compare-head {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #1c2638;
      font-size: 16px;
      font-weight: 780;
    }
    .model-brand-mark {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid rgba(15, 23, 42, .14);
      box-shadow: 0 10px 22px rgba(15, 23, 42, .10);
    }
    .model-brand-mark img {
      width: 19px;
      height: 19px;
      display: block;
      object-fit: contain;
    }
    .compare-card h3 {
      margin-top: 28px;
      color: #07101f;
      font-size: ${isZh ? 26 : 23}px;
      line-height: 1.2;
      font-weight: 820;
      letter-spacing: ${isZh ? '.01em' : '0'};
    }
    .compare-card p {
      margin-top: 16px;
      color: #4a556b;
      font-size: ${isZh ? 17 : 16}px;
      line-height: 1.48;
      font-weight: 620;
    }
    .compare-card .s1 { width: 92%; margin-top: 30px; }
    .compare-card .s2 { width: 70%; margin-top: 12px; }
    .compare-note {
      position: absolute;
      left: 360px;
      bottom: 18px;
      color: rgba(15, 23, 42, .56);
      font-size: ${isZh ? 16 : 15}px;
      font-weight: 760;
    }

    .paint-copy h1 { font-size: ${isZh ? 58 : 50}px; }
    .paint-stage {
      left: 48px;
      right: 48px;
      bottom: 38px;
      height: 480px;
    }
    .paint-sidebar {
      position: absolute;
      left: 0;
      top: 30px;
      width: 246px;
      height: 382px;
      border-radius: 22px;
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
    }
    .paint-sidebar span,
    .history-card span {
      color: #64748b;
      font-size: 13px;
      font-weight: 760;
    }
    .paint-sidebar strong,
    .history-card strong {
      color: #0f172a;
      font-size: 19px;
      font-weight: 820;
    }
    .input-thumb {
      width: 118px;
      height: 118px;
      margin-top: 8px;
      border-radius: 24px;
      background:
        radial-gradient(circle at 78% 22%, #f6e27f 0 15%, transparent 16%),
        linear-gradient(155deg, #0d3b52 0 40%, #0f766e 41% 65%, #032f25 66% 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .42);
    }
    .canvas-card {
      position: absolute;
      left: 270px;
      top: 0;
      width: 655px;
      height: 452px;
      border-radius: 24px;
      padding: 18px;
    }
    .poster-art {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 18px;
      background: linear-gradient(145deg, #0d334b 0%, #0f766e 58%, #74d1af 100%);
    }
    .sun {
      position: absolute;
      right: 92px;
      top: 42px;
      width: 104px;
      height: 104px;
      border-radius: 50%;
      background: #efe68b;
    }
    .hill {
      position: absolute;
      left: -80px;
      right: -60px;
      height: 220px;
      border-radius: 50% 50% 0 0;
      transform: rotate(-8deg);
    }
    .hill-a { bottom: 42px; background: rgba(9, 92, 73, .92); }
    .hill-b { bottom: -34px; background: rgba(3, 47, 37, .98); }
    .glass-report {
      position: absolute;
      left: 82px;
      top: 88px;
      width: 258px;
      min-height: 172px;
      padding: 28px;
      border-radius: 28px;
      color: #102034;
      background: rgba(255, 255, 255, .80);
      box-shadow: 0 24px 50px rgba(3, 47, 37, .22);
    }
    .glass-report strong {
      display: block;
      font-size: ${isZh ? 27 : 24}px;
      font-weight: 820;
    }
    .glass-report span {
      display: block;
      margin-top: 12px;
      color: #496073;
      font-size: 15px;
      font-weight: 700;
    }
    .glass-report div {
      display: flex;
      gap: 14px;
      margin-top: 24px;
    }
    .glass-report i {
      width: 54px;
      height: 40px;
      border-radius: 11px;
      background: #c9fff0;
    }
    .glass-report i:nth-child(2) { background: #ffd7a3; }
    .glass-report i:nth-child(3) { background: #bfe0ff; }
    .metric-chip {
      position: absolute;
      right: 78px;
      bottom: 112px;
      padding: 18px 28px;
      border-radius: 24px;
      color: #fff;
      font-size: 28px;
      font-weight: 850;
      background: rgba(15, 23, 42, .74);
      box-shadow: 0 20px 48px rgba(15, 23, 42, .22);
    }
    .history-card {
      position: absolute;
      right: 0;
      top: 42px;
      width: 238px;
      height: 176px;
      padding: 22px;
      border-radius: 22px;
    }
    .history-item {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 18px;
    }
    .history-item div {
      width: 58px;
      height: 58px;
      border-radius: 16px;
      background: linear-gradient(145deg, #0d334b, #13a18d);
    }
    .history-item p {
      color: #334155;
      font-size: 14px;
      line-height: 1.35;
      font-weight: 720;
    }
    .prompt-card {
      position: absolute;
      right: 0;
      bottom: 28px;
      width: 384px;
      min-height: 154px;
      padding: 22px;
      border-radius: 22px;
    }
    .prompt-card strong {
      color: #0f172a;
      font-size: 16px;
      font-weight: 820;
    }
    .prompt-card p {
      margin-top: 12px;
      color: #29364b;
      font-size: ${isZh ? 16 : 15}px;
      line-height: 1.5;
      font-weight: 650;
    }

    .tools-copy h1 { font-size: ${isZh ? 56 : 50}px; }
    .tools-stage {
      left: 72px;
      right: 72px;
      bottom: 38px;
      height: 474px;
    }
    .web-page {
      position: absolute;
      left: 0;
      top: 22px;
      width: 688px;
      height: 420px;
    }
    .page-lines {
      padding: 38px 34px;
    }
    .page-lines p {
      width: 84%;
      margin: 0 0 20px;
    }
    .page-lines .short { width: 56%; }
    .selection-box {
      position: absolute;
      left: 74px;
      top: 156px;
      width: 442px;
      height: 132px;
      padding: 22px;
      border-radius: 4px;
      background: rgba(183, 219, 255, .38);
      border: 3px solid rgba(37, 99, 235, .55);
    }
    .selection-box span {
      display: inline-flex;
      margin: 8px 8px 0 0;
      padding: 8px 12px;
      border-radius: 999px;
      color: #1e3a8a;
      font-size: ${isZh ? 16 : 14}px;
      font-weight: 850;
      background: rgba(255, 255, 255, .82);
    }
    .tool-strip {
      position: absolute;
      left: 88px;
      bottom: 46px;
      padding: 15px 22px;
      border-radius: 999px;
      color: #111827;
      font-size: ${isZh ? 17 : 15}px;
      font-weight: 800;
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 18px 46px rgba(99, 116, 152, .20);
    }
    .ocr-card,
    .element-card,
    .mini-chat-card {
      position: absolute;
      border-radius: 22px;
      padding: 22px;
    }
    .ocr-card {
      right: 138px;
      top: 28px;
      width: 350px;
      min-height: 158px;
    }
    .ocr-card strong,
    .element-card strong {
      color: #0f172a;
      font-size: 24px;
      font-weight: 820;
    }
    .ocr-card p {
      margin-top: 14px;
      color: #29364b;
      font-size: ${isZh ? 18 : 16}px;
      line-height: 1.48;
      font-weight: 680;
    }
    .element-card {
      right: 0;
      top: 216px;
      width: 356px;
    }
    .element-card span {
      display: block;
      margin-top: 16px;
      padding: 13px 16px;
      border-radius: 14px;
      color: #475569;
      font-size: 15px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #f8fafc;
      border: 1px solid #e5edf6;
    }
    .mini-chat-card {
      right: 54px;
      bottom: 8px;
      width: 438px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .mini-chat-card p {
      color: #223049;
      font-size: ${isZh ? 17 : 15}px;
      line-height: 1.45;
      font-weight: 720;
    }

    .local-copy h1 { font-size: ${isZh ? 66 : 58}px; }
    .privacy-stage {
      right: 80px;
      top: 116px;
      width: 630px;
      height: 552px;
    }
    .privacy-lines {
      position: absolute;
      inset: 30px 0 0 0;
      width: 620px;
      height: 500px;
      z-index: 1;
    }
    .privacy-lines path {
      fill: none;
      stroke: rgba(0, 163, 217, .28);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dasharray: 8 10;
    }
    .local-core {
      position: absolute;
      left: 202px;
      top: 190px;
      z-index: 3;
      width: 226px;
      min-height: 174px;
      padding: 24px;
      border-radius: 32px;
      text-align: center;
    }
    .local-core .core-logo {
      justify-content: center;
      margin-bottom: 14px;
    }
    .local-core .core-logo span { display: none; }
    .local-core strong {
      display: block;
      color: #0f172a;
      font-size: ${isZh ? 23 : 20}px;
      font-weight: 820;
    }
    .local-core p {
      margin-top: 10px;
      color: #536179;
      font-size: ${isZh ? 15 : 14}px;
      line-height: 1.45;
      font-weight: 650;
    }
    .privacy-node {
      position: absolute;
      z-index: 4;
      display: grid;
      place-items: center;
      min-width: 94px;
      min-height: 66px;
      padding: 14px 18px;
      border-radius: 22px;
      color: #fff;
      font-size: ${isZh ? 18 : 16}px;
      font-weight: 820;
      box-shadow: 0 20px 46px rgba(15, 23, 42, .14);
    }
    .node-0 { left: 52px; top: 84px; background: linear-gradient(135deg, #111827, #334155); }
    .node-1 { right: 52px; top: 84px; background: linear-gradient(135deg, #2563eb, #06b6d4); }
    .node-2 { left: 28px; top: 338px; background: linear-gradient(135deg, #10b981, #14b8a6); }
    .node-3 { right: 28px; top: 338px; background: linear-gradient(135deg, #7c3aed, #a855f7); }
    .node-4 { left: 260px; top: 18px; background: linear-gradient(135deg, #fb7185, #f97316); }
    .node-5 { left: 118px; bottom: 104px; background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    .node-6 { right: 42px; bottom: 108px; background: linear-gradient(135deg, #0f766e, #14b8a6); }
    .boundary-card {
      position: absolute;
      left: 116px;
      right: 116px;
      bottom: 2px;
      z-index: 5;
      padding: 20px 24px;
      border-radius: 24px;
      text-align: center;
    }
    .boundary-card strong {
      display: block;
      color: #0f172a;
      font-size: ${isZh ? 22 : 20}px;
      font-weight: 820;
    }
    .boundary-card span {
      display: block;
      margin-top: 8px;
      color: #536179;
      font-size: ${isZh ? 15 : 14}px;
      line-height: 1.4;
      font-weight: 720;
    }
  </style>
</head>
<body>
  <main class="stage">
    <div class="brand">${logoMarkup()}</div>
    ${sceneMarkup(scene, lang)}
  </main>
</body>
</html>`;
}

async function assertImagesReady(page, fileName) {
  const failures = await page.evaluate(() => {
    return Array.from(document.images).flatMap((img) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return [];
      return [{ src: img.currentSrc || img.src, complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }];
    });
  });
  if (failures.length > 0) {
    throw new Error(`Poster image failed to load in ${fileName}: ${JSON.stringify(failures)}`);
  }
}

async function assertNoLayoutFailures(page, fileName) {
  const failures = await page.evaluate(() => {
    const checkedNodes = Array.from(
      document.querySelectorAll(
        'h1, .copy p, .product-stage, .browser-window, .side-panel, .compare-card, .paint-sidebar, .canvas-card, .history-card, .prompt-card, .ocr-card, .element-card, .mini-chat-card, .local-core, .privacy-node, .boundary-card, .prompt-ribbon',
      ),
    );
    const overflowFailures = checkedNodes.flatMap((node) => {
      const element = node;
      const rect = element.getBoundingClientRect();
      const overflowX = element.scrollWidth - element.clientWidth;
      const overflowY = element.scrollHeight - element.clientHeight;
      const boundsOverflow = Math.max(0, -rect.left, -rect.top, rect.right - window.innerWidth, rect.bottom - window.innerHeight);
      if (overflowX <= 2 && overflowY <= 8 && boundsOverflow <= 1) return [];
      return [{
        label: element.className || element.tagName.toLowerCase(),
        overflowX,
        overflowY,
        boundsOverflow,
        text: element.textContent?.trim().slice(0, 120) ?? '',
      }];
    });

    const titleFailures = Array.from(document.querySelectorAll('h1')).flatMap((title) => {
      const style = window.getComputedStyle(title);
      const fontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const letterSpacing = style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing);
      const lang = document.documentElement.lang;
      const minLineHeight = lang === 'zh-CN' ? 1.12 : 1.08;
      const failures = [];
      if (Number.isFinite(letterSpacing) && letterSpacing < -0.1) failures.push({ label: 'negative-letter-spacing', letterSpacing });
      if (Number.isFinite(lineHeight) && Number.isFinite(fontSize) && lineHeight / fontSize < minLineHeight) {
        failures.push({ label: 'tight-line-height', lineHeightRatio: lineHeight / fontSize });
      }
      return failures;
    });

    const forbiddenUi = Array.from(document.querySelectorAll('button, [role="button"], .badge, .tag')).map((node) => ({
      label: 'forbidden-store-decoration',
      tagName: node.tagName,
      className: node.className,
      text: node.textContent?.trim() ?? '',
    }));

    const pageContextCopy = document.querySelector('.page-context-copy');
    const pageContextStage = document.querySelector('.page-context-stage');
    const pageContextSpacingFailures = [];
    if (pageContextCopy && pageContextStage) {
      const copyRect = pageContextCopy.getBoundingClientRect();
      const stageRect = pageContextStage.getBoundingClientRect();
      const gap = stageRect.left - copyRect.right;
      if (gap < 36) {
        pageContextSpacingFailures.push({
          label: 'page-context-copy-overlaps-product-stage',
          gap,
          copyRight: copyRect.right,
          stageLeft: stageRect.left,
        });
      }
    }

    const cssText = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n');
    const cssFailures = [];
    if (/\bobject-fit\s*:\s*cover\b/.test(cssText)) cssFailures.push({ label: 'object-fit-cover-forbidden' });
    if (/letter-spacing\s*:\s*-\.(0[7-9]|[1-9])/.test(cssText)) cssFailures.push({ label: 'excessive-negative-letter-spacing-forbidden' });

    return [...overflowFailures, ...titleFailures, ...forbiddenUi, ...pageContextSpacingFailures, ...cssFailures];
  });
  if (failures.length > 0) {
    throw new Error(`Poster layout check failed in ${fileName}: ${JSON.stringify(failures)}`);
  }
}

async function renderPoster(page, lang, scene) {
  const fileName = outputName(lang, scene);
  await page.setContent(posterHtml({ scene, lang }), { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) => img.decode()));
  });
  await assertImagesReady(page, fileName);
  await assertNoLayoutFailures(page, fileName);
  await page.screenshot({ path: path.join(outputDir, fileName), fullPage: false });
  console.log(`generated ${fileName}`);
}

function assertExpectedStorePosters() {
  const actual = fs.readdirSync(outputDir).filter((name) => /^olyq-store-.*\.png$/.test(name)).sort();
  const expected = expectedPosterNames();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Unexpected store poster set: ${JSON.stringify({ expected: expected.length, actual: actual.length, missing, extra })}`);
  }
}

function assertExpectedProductPngCount() {
  const total = fs.readdirSync(outputDir).filter((name) => /^olyq-.*\.png$/.test(name)).length;
  if (total !== 32) {
    throw new Error(`Expected 32 Olyq product PNG files after poster generation, found ${total}.`);
  }
}

async function main() {
  cleanStorePosters();
  await loadStoreAssetFonts();
  await loadModelBrandIcons();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    for (const lang of langs) {
      for (const scene of scenes) {
        await renderPoster(page, lang, scene);
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
  assertExpectedStorePosters();
  assertExpectedProductPngCount();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
