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

const copy = {
  en: {
    title: 'Answers that cite the page',
    subtitle: 'Turn page text, selection, and screenshots into cited findings.',
    pageTitle: 'Checkout launch review',
    question: 'Organize this page into findings, page evidence, risks, and next steps.',
    answerTitle: 'Grounded answer from the tab',
    chips: ['Page text', 'Selection', 'Screenshot clue'],
    bullets: [
      'Fix payment recovery before rewriting the form.',
      'Page evidence: +5.6% completion, but 34% of tickets mention the fee step.',
      'Confirm next: procurement flow and retry entry.',
    ],
  },
  zh: {
    title: '让回答引用当前网页',
    subtitle: '正文、选区、截图一起进对话，输出结论、证据和待确认项。',
    pageTitle: '结账页上线复盘',
    question: '按“结论 / 页面证据 / 风险 / 下一步”整理这页。',
    answerTitle: '页面材料支持的判断',
    chips: ['页面正文', '选中文本', '截图线索'],
    bullets: [
      '先处理支付失败恢复，再调整表单文案。',
      '页面证据：完成率 +5.6%，但 34% 工单集中在费用步骤。',
      '还要确认：企业采购流程和失败重试入口。',
    ],
  },
};

const promoSpecs = [
  { kind: 'small', lang: 'en', width: 440, height: 280, fileName: 'olyq-promo-small.png', aliases: ['olyq-promo-en-small.png'] },
  { kind: 'marquee', lang: 'en', width: 1400, height: 560, fileName: 'olyq-promo-marquee.png', aliases: ['olyq-promo-en-marquee.png'] },
  { kind: 'small', lang: 'zh', width: 440, height: 280, fileName: 'olyq-promo-zh-small.png' },
  { kind: 'marquee', lang: 'zh', width: 1400, height: 560, fileName: 'olyq-promo-zh-marquee.png' },
];

let storeAssetFontCss = '';

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

async function loadStoreAssetFonts() {
  const zhText = Object.values(copy.zh)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .join('');
  storeAssetFontCss = await buildStoreAssetFontCss({
    includeChinese: true,
    chineseText: zhText,
  });
}

function logoMarkup() {
  return `<img class="brand-icon" src="${fileDataUri(iconPath)}" alt="">`;
}

function chipList(chips) {
  return chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
}

function browserDots() {
  return '<span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>';
}

function pageContextProductMarkup(lang) {
  const strings = copy[lang];
  const bullets = strings.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('');
  return `
    <section class="product-stage">
      <div class="browser-window article-window">
        <div class="browser-top">${browserDots()}<span>${escapeHtml(strings.pageTitle)}</span></div>
        <div class="article-body">
          <strong>${escapeHtml(strings.pageTitle)}</strong>
          <p></p><p></p><p class="short"></p>
          <div class="highlight-line"></div>
          <p></p><p class="wide"></p>
        </div>
      </div>
      <div class="side-panel answer-panel">
        <div class="panel-head">
          <span class="mini-logo">${logoMarkup()}<span class="wordmark">Olyq</span></span>
          <span class="model-pill">GPT-5.5</span>
        </div>
        <div class="context-bar">${chipList(strings.chips)}</div>
        <div class="question-card">${escapeHtml(strings.question)}</div>
        <div class="tool-row"><span></span>browser_context.read_page</div>
        <div class="tool-row"><span></span>web_search</div>
        <h2>${escapeHtml(strings.answerTitle)}</h2>
        <ul>${bullets}</ul>
      </div>
    </section>`;
}

function baseStyles({ width, height, isZh, isSmall }) {
  const scale = isSmall ? 0.34 : 0.86;
  return `
    ${storeAssetFontCss}
    * { box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      overflow: hidden;
      background: #fbfdff;
    }
    body {
      color: #05070f;
      font-family: ${isZh ? '"Noto Sans SC", ' : ''}"Sora", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-feature-settings: "kern" 1;
      text-rendering: geometricPrecision;
    }
    .stage {
      position: relative;
      width: ${width}px;
      height: ${height}px;
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
      background-size: ${isSmall ? 40 : 64}px ${isSmall ? 40 : 64}px;
      mask-image: radial-gradient(circle at 62% 62%, black 0%, transparent 76%);
    }
    .brand {
      position: absolute;
      top: ${isSmall ? 17 : 46}px;
      left: ${isSmall ? 18 : 76}px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: ${isSmall ? 5 : 13}px;
      color: rgba(5, 7, 15, .78);
      font-family: "Sora", sans-serif;
      font-size: ${isSmall ? 9 : 26}px;
      font-weight: 800;
      letter-spacing: -.015em;
    }
    .brand-icon {
      display: block;
      width: ${isSmall ? 14 : 40}px;
      height: ${isSmall ? 14 : 40}px;
      border-radius: ${isSmall ? 4 : 11}px;
      box-shadow: 0 ${isSmall ? 5 : 12}px ${isSmall ? 13 : 30}px rgba(0, 163, 217, .20);
    }
    .copy {
      position: absolute;
      z-index: 4;
      left: ${isSmall ? 18 : 76}px;
      top: ${isSmall ? 68 : 146}px;
      width: ${isSmall ? (isZh ? 138 : 142) : (isZh ? 420 : 420)}px;
    }
    .copy h1 {
      margin: 0;
      color: #05070f;
      font-family: ${isZh ? '"Noto Sans SC", ' : ''}"Sora", sans-serif;
      font-size: ${isSmall ? (isZh ? 23 : 21) : (isZh ? 58 : 54)}px;
      line-height: ${isZh ? 1.18 : 1.12};
      letter-spacing: ${isZh ? '.018em' : '0'};
      font-weight: 800;
      text-wrap: balance;
    }
    .copy p {
      margin: ${isSmall ? 8 : 22}px 0 0;
      color: rgba(20, 29, 48, .68);
      font-size: ${isSmall ? (isZh ? 9 : 8) : (isZh ? 23 : 21)}px;
      line-height: ${isZh ? 1.50 : 1.44};
      font-weight: 500;
      letter-spacing: ${isZh ? '.006em' : '0'};
    }
    .product-stage {
      position: absolute;
      z-index: 2;
      left: ${isSmall ? (isZh ? 242 : 238) : 690}px;
      top: ${isSmall ? 42 : 50}px;
      width: ${isSmall ? 258 : 760}px;
      height: ${isSmall ? 238 : 500}px;
      transform-origin: top left;
      transform: scale(${scale});
    }
    .browser-window,
    .side-panel {
      background: rgba(255, 255, 255, .84);
      border: 1px solid rgba(220, 226, 238, .92);
      box-shadow: 0 28px 80px rgba(99, 116, 152, .18);
      backdrop-filter: blur(18px);
    }
    .browser-top {
      height: 42px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 18px;
      color: rgba(51, 65, 85, .64);
      font-size: 12px;
      font-weight: 760;
      border-bottom: 1px solid #e9eef5;
      background: rgba(248, 250, 252, .92);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      display: block;
      flex: 0 0 auto;
    }
    .red { background: #ff5f57; }
    .yellow { background: #ffbd2e; }
    .green { background: #28c840; margin-right: 8px; }
    .article-window {
      position: absolute;
      left: 0;
      top: 96px;
      width: 430px;
      height: 402px;
      border-radius: 20px;
      overflow: hidden;
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
    .article-body p {
      height: 16px;
      margin: 13px 0;
      border-radius: 999px;
      background: #eef2f7;
    }
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
    .mini-logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #0b1220;
      font-size: 18px;
      font-weight: 760;
    }
    .mini-logo .brand-icon {
      width: 25px;
      height: 25px;
      border-radius: 7px;
      box-shadow: none;
    }
    .wordmark {
      font-family: "Sora", sans-serif;
      font-weight: 800;
      letter-spacing: -.018em;
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
  `;
}

function promoHtml({ kind, lang, width, height }) {
  const isZh = lang === 'zh';
  const strings = copy[lang];
  return `<!doctype html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <style>${baseStyles({ width, height, isZh, isSmall: kind === 'small' })}</style>
</head>
<body>
  <main class="stage">
    <div class="brand">${logoMarkup()}<span>Olyq</span></div>
    <section class="copy">
      <h1>${escapeHtml(strings.title)}</h1>
      <p>${escapeHtml(strings.subtitle)}</p>
    </section>
    ${pageContextProductMarkup(lang)}
  </main>
</body>
</html>`;
}

function cleanStorePromos() {
  for (const name of fs.readdirSync(outputDir)) {
    if (/^olyq-promo.*\.png$/.test(name)) {
      fs.unlinkSync(path.join(outputDir, name));
    }
  }
}

function readPngColorType(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return buffer[25];
}

async function assertImagesReady(page, fileName) {
  const failures = await page.evaluate(() => {
    return Array.from(document.images).flatMap((img) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return [];
      return [{ src: img.currentSrc || img.src, complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }];
    });
  });
  if (failures.length > 0) {
    throw new Error(`Promo image failed to load in ${fileName}: ${JSON.stringify(failures)}`);
  }
}

async function assertNoLayoutFailures(page, fileName, spec) {
  const failures = await page.evaluate(({ lang }) => {
    const checkedNodes = Array.from(document.querySelectorAll('.brand, .copy, .product-stage, .browser-window, .side-panel'));
    const overflowFailures = checkedNodes.flatMap((node) => {
      const element = node;
      const rect = element.getBoundingClientRect();
      const ignoreInternalOverflow = element.classList.contains('product-stage');
      const overflowX = ignoreInternalOverflow ? 0 : element.scrollWidth - element.clientWidth;
      const overflowY = ignoreInternalOverflow ? 0 : element.scrollHeight - element.clientHeight;
      const boundsOverflow = Math.max(0, -rect.left, -rect.top, rect.right - window.innerWidth, rect.bottom - window.innerHeight);
      if (overflowX <= 2 && overflowY <= 6 && boundsOverflow <= 1) return [];
      return [{
        label: element.className || element.tagName.toLowerCase(),
        overflowX,
        overflowY,
        boundsOverflow,
        text: element.textContent?.trim().slice(0, 120) ?? '',
      }];
    });

    const textFailures = Array.from(document.querySelectorAll('h1, .copy p')).flatMap((node) => {
      const text = node.textContent?.trim() ?? '';
      if (/\bAI\b/i.test(text)) return [{ label: 'promo-copy-should-not-say-ai', text }];
      if (node.matches('h1') && text.replace(/\s+/g, ' ').length > (lang === 'zh' ? 16 : 32)) return [{ label: 'promo-title-too-long', text }];
      if (node.matches('.copy p') && text.length > (lang === 'zh' ? 36 : 72)) return [{ label: 'promo-subtitle-too-long', text }];
      return [];
    });

    const overlap = (first, second, gap = 24) => {
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return !(a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top);
    };
    const collisionPairs = [
      ['.brand', '.copy', 18],
      ['.copy', '.product-stage', 22],
    ];
    const collisionFailures = collisionPairs.flatMap(([firstSelector, secondSelector, gap]) => {
      const first = document.querySelector(firstSelector);
      const second = document.querySelector(secondSelector);
      if (!first || !second || !overlap(first, second, gap)) return [];
      return [{
        label: 'promo-critical-collision',
        first: firstSelector,
        second: secondSelector,
        gap,
      }];
    });

    const bodyText = document.body.textContent ?? '';
    const titleText = document.querySelector('h1')?.textContent?.trim() ?? '';
    const duplicateTitleFailures = titleText && (bodyText.match(new RegExp(titleText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0) > 1
      ? [{ label: 'promo-title-duplicated', titleText }]
      : [];

    const cssText = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n');
    const cssFailures = [];
    if (/\bbackground\s*:\s*transparent\b/.test(cssText)) cssFailures.push({ label: 'transparent-background-forbidden' });
    if (/Browser-native AI workspace|AI for the page|Ask with context|Browser sidekick|poster-window/.test(`${cssText}\n${bodyText}`)) {
      cssFailures.push({ label: 'retired-promo-style-or-copy-found' });
    }
    if (/letter-spacing:\s*-\.(0[4-9]|[1-9])/.test(cssText)) {
      cssFailures.push({ label: 'promo-letter-spacing-too-tight' });
    }

    return [...overflowFailures, ...textFailures, ...collisionFailures, ...duplicateTitleFailures, ...cssFailures];
  }, { lang: spec.lang });
  if (failures.length > 0) {
    throw new Error(`Promo layout check failed in ${fileName}: ${JSON.stringify(failures)}`);
  }
}

async function renderPromo(page, spec) {
  const outPath = path.join(outputDir, spec.fileName);
  await page.setViewportSize({ width: spec.width, height: spec.height });
  await page.setContent(promoHtml(spec), { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) => img.decode()));
  });
  await assertImagesReady(page, spec.fileName);
  await assertNoLayoutFailures(page, spec.fileName, spec);
  await page.screenshot({ path: outPath, fullPage: false, omitBackground: false });
  const colorType = readPngColorType(outPath);
  if (colorType !== 2) {
    throw new Error(`Expected 24-bit RGB PNG without alpha for ${spec.fileName}, found PNG color type ${colorType}.`);
  }
  console.log(`generated ${spec.fileName}`);
}

function assertExpectedStorePromos() {
  const actual = fs.readdirSync(outputDir).filter((name) => /^olyq-promo.*\.png$/.test(name)).sort();
  const expected = promoSpecs.flatMap((spec) => [spec.fileName, ...(spec.aliases ?? [])]).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Unexpected promo image set: ${JSON.stringify({ expected: expected.length, actual: actual.length, missing, extra })}`);
  }
}

async function main() {
  cleanStorePromos();
  await loadStoreAssetFonts();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1 });
    for (const spec of promoSpecs) {
      await renderPromo(page, spec);
      for (const alias of spec.aliases ?? []) {
        fs.copyFileSync(path.join(outputDir, spec.fileName), path.join(outputDir, alias));
        console.log(`generated ${alias}`);
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
  assertExpectedStorePromos();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
