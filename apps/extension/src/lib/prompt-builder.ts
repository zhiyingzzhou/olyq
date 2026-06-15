/**
 * 说明：`prompt-builder` 基础能力模块。
 *
 * 职责：
 * - 承载普通划词动作的提示词构建逻辑；
 * - 对外暴露 `PromptAction`、`PromptSource`、`SelectionPromptInput` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { PageStyleSignalsPayload } from '@/types/sw-messages';
import { normalizePromptLanguage, type PromptLanguage } from '@/lib/prompt-language';

/** prompt builder 使用的最小翻译函数契约。 */
export type PromptBuilderTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 内部函数变量：`promptBuilderFallbackT`。
 *
 * @remarks
 * 仅供没有 UI 翻译函数的纯函数测试或后台上下文兜底使用，避免默认落回中文模板。
 */
const promptBuilderFallbackT: PromptBuilderTranslate = (key, params) => {
  const dict: Record<string, string> = {
    'selectionPrompt.targetChinese': 'Chinese',
    'selectionPrompt.targetEnglish': 'English',
    'selectionPrompt.source': '\n\nSource: {{title}}\n{{url}}',
    'selectionPrompt.translate': 'Translate the following content into {{targetLanguage}}, preserving tone and formatting:\n\n"{{text}}"{{source}}',
    'selectionPrompt.summarize': 'Summarize the following content as bullet points and add a one-sentence conclusion:\n\n"{{text}}"{{source}}',
    'selectionPrompt.explain': 'Explain the following content and add any necessary background and examples:\n\n"{{text}}"{{source}}',
    'selectionPrompt.ask': 'Analyze and give suggestions based on the following quote:\n\n"{{text}}"{{source}}',
  };
  return (dict[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params?.[name] ?? ''));
};

/**
 * 需求 H-10：提示词构建逻辑
 *
 * 将 `ui/selection` 的 action 提示词矩阵提取为独立模块，消除嵌套三元表达式重复。
 */

/**
 * 统一的提示词动作类型。
 *
 * - `translate`：翻译内容
 * - `summarize`：提炼要点
 * - `explain`：解释背景与含义
 * - `ask`：开放式分析或提问
 */
export type PromptAction = 'translate' | 'summarize' | 'explain' | 'ask';

/**
 * 提示词来源上下文。
 */
export interface PromptSource {
  /**
   * 当前内容所属网页地址；为空时不拼接来源段落。
   */
  url?: string;
  /**
   * 当前页面标题或元素来源标题，用于提高提示词上下文可读性。
   */
  title?: string;
}

/**
 * 将任意原始动作值归一化到受支持的提示词动作集合中。
 *
 * @param raw - UI 层或 bridge 层传入的动作字符串。
 * @returns 未识别的动作会降级为 `ask`，保证构建流程可继续执行。
 */
function normalizeAction(raw: string): PromptAction {
  if (raw === 'translate' || raw === 'summarize' || raw === 'explain') return raw;
  return 'ask';
}

/**
 * 根据文本内容粗略判断翻译目标语言。
 *
 * @param text - 用户当前选中的文本或元素提取文本。
 * @returns 若原文包含中文字符则默认输出英文译文，否则默认输出中文译文。
 */
function detectTargetLang(text: string, t: PromptBuilderTranslate): string {
  const containsZh = /[\u4e00-\u9fa5]/.test(text);
  return t(containsZh ? 'selectionPrompt.targetEnglish' : 'selectionPrompt.targetChinese');
}

/**
 * 将来源网页信息格式化为附加上下文段落。
 *
 * @param url - 来源地址。
 * @param title - 来源标题。
 * @returns 没有 URL 时返回空字符串，避免模板出现空占位。
 */
function formatSelectionSource(url: string, title: string, t: PromptBuilderTranslate): string {
  if (!url) return '';
  return t('selectionPrompt.source', { title: title || url, url });
}

/** 页面设计信号 prompt 的自有标签文案。 */
const PAGE_STYLE_PROMPT_COPY: Record<PromptLanguage, {
  source: string;
  fallback: string;
  listSeparator: string;
  headingMarkdown: string;
  headingText: string;
  intro: string[];
  pageSection: string;
  typographySection: string;
  layoutSection: string;
  componentsSection: string;
  decorationSection: string;
  samplesSection: string;
  labels: Record<string, string>;
  booleans: Record<string, { yes: string; no: string }>;
}> = {
  'zh-CN': {
    source: '来源',
    fallback: '未提取到',
    listSeparator: '、',
    headingMarkdown: '## 页面设计信号',
    headingText: '【页面设计信号】',
    intro: [
      '这是一份基于 DOM + computed style 抽样得到的近似页面设计信号，不是截图。',
      '仅在用户明确询问页面设计、UI 风格、配色、排版、布局、组件语言或品牌气质时引用；若问题无关请忽略。',
      '不要把未确认的像素级观感、图片内容、品牌素材或视觉细节写成既定事实。',
    ],
    pageSection: '页面',
    typographySection: '排版',
    layoutSection: '布局',
    componentsSection: '组件',
    decorationSection: '装饰',
    samplesSection: '样本',
    labels: {
      backgroundColor: '主背景色',
      textColor: '主文本色',
      linkColor: '链接色',
      primaryButtonColor: '主按钮色',
      borderColors: '常见边框色',
      shadowSamples: '常见阴影',
      radiusSamples: '常见圆角',
      maxContentWidth: '最大内容宽度',
      layoutTendency: '布局倾向',
      bodyFont: '正文字体',
      headingFont: '标题字体',
      buttonFont: '按钮字体',
      bodySpec: '正文规格',
      lineHeight: '行高',
      headingSizes: '标题字号样本',
      buttonSizes: '按钮字号样本',
      fontWeights: '字重样本',
      hero: 'Hero',
      navStyle: '导航样式',
      sectionCount: '主区块数量',
      sectionGaps: 'Section 间距样本',
      cardGrid: '卡片/栅格倾向',
      imageDensity: '图片密度',
      buttonStyles: '按钮样式样本',
      cardStyles: '卡片样式样本',
      inputStyles: '输入框样式样本',
      tagStyles: '标签样式样本',
      navStyles: '导航样式样本',
      largeImages: '大图',
      gradients: '渐变',
      illustrations: '插画 / 大量 SVG',
      borders: '边框',
      glass: '玻璃态',
      shadows: '阴影',
      stickyHeader: '粘性头部',
      headingSamples: '标题样本',
      sectionSamples: '区块样本',
      cardSamples: '卡片样本',
    },
    booleans: {
      centeredLayout: { yes: '居中布局', no: '非居中布局' },
      airyWhitespace: { yes: '留白偏多', no: '留白偏紧' },
      exists: { yes: '存在', no: '未明显识别' },
      obviousExists: { yes: '明显存在', no: '不明显' },
      obviousUses: { yes: '明显使用', no: '不明显' },
    },
  },
  'en-US': {
    source: 'Source',
    fallback: 'not detected',
    listSeparator: ', ',
    headingMarkdown: '## Page Design Signals',
    headingText: '[Page design signals]',
    intro: [
      'This is an approximate page design signal summary sampled from DOM and computed styles; it is not a screenshot.',
      'Use it only when the user explicitly asks about page design, UI style, colors, typography, layout, component language, or brand feel. Ignore it when unrelated.',
      'Do not present unverified pixel-level appearance, image content, brand assets, or visual details as facts.',
    ],
    pageSection: 'Page',
    typographySection: 'Typography',
    layoutSection: 'Layout',
    componentsSection: 'Components',
    decorationSection: 'Decoration',
    samplesSection: 'Samples',
    labels: {
      backgroundColor: 'Primary background color',
      textColor: 'Primary text color',
      linkColor: 'Link color',
      primaryButtonColor: 'Primary button color',
      borderColors: 'Common border colors',
      shadowSamples: 'Common shadows',
      radiusSamples: 'Common radii',
      maxContentWidth: 'Max content width',
      layoutTendency: 'Layout tendency',
      bodyFont: 'Body font',
      headingFont: 'Heading font',
      buttonFont: 'Button font',
      bodySpec: 'Body spec',
      lineHeight: 'line height',
      headingSizes: 'Heading size samples',
      buttonSizes: 'Button size samples',
      fontWeights: 'Font weight samples',
      hero: 'Hero',
      navStyle: 'Navigation style',
      sectionCount: 'Main section count',
      sectionGaps: 'Section gap samples',
      cardGrid: 'Card/grid tendency',
      imageDensity: 'Image density',
      buttonStyles: 'Button style samples',
      cardStyles: 'Card style samples',
      inputStyles: 'Input style samples',
      tagStyles: 'Tag style samples',
      navStyles: 'Navigation style samples',
      largeImages: 'Large images',
      gradients: 'Gradients',
      illustrations: 'Illustrations / heavy SVG use',
      borders: 'Borders',
      glass: 'Glass effect',
      shadows: 'Shadows',
      stickyHeader: 'Sticky header',
      headingSamples: 'Heading samples',
      sectionSamples: 'Section samples',
      cardSamples: 'Card samples',
    },
    booleans: {
      centeredLayout: { yes: 'centered layout', no: 'not centered' },
      airyWhitespace: { yes: 'airy whitespace', no: 'tight whitespace' },
      exists: { yes: 'present', no: 'not clearly detected' },
      obviousExists: { yes: 'clearly present', no: 'not obvious' },
      obviousUses: { yes: 'clearly used', no: 'not obvious' },
    },
  },
};

type PageStylePromptCopy = (typeof PAGE_STYLE_PROMPT_COPY)[PromptLanguage];

/** 格式化页面设计信号来源段落。 */
function formatPageStyleSource(url: string, title: string, copy: PageStylePromptCopy): string {
  if (!url) return '';
  return `\n\n${copy.source}: ${title || url}\n${url}`;
}

// ── Selection prompt（纯文本划词） ──────────────────────────

/**
 * 划词提示词构建输入。
 */
export interface SelectionPromptInput {
  /**
   * 用户在划词工具栏中触发的动作标识。
   */
  action: string;
  /**
   * 被选中的纯文本内容。
   */
  text: string;
  /**
   * 可选来源信息，通常来自当前标签页地址与标题。
   */
  source?: PromptSource;
  /** 当前 UI 语言翻译函数；缺省时使用英文兜底，避免持久化中文模板。 */
  t?: PromptBuilderTranslate;
}

/**
 * 纯文本划词场景的提示词模板矩阵。
 */
const SELECTION_PROMPT_KEYS: Record<PromptAction, string> = {
  translate: 'selectionPrompt.translate',
  summarize: 'selectionPrompt.summarize',
  explain: 'selectionPrompt.explain',
  ask: 'selectionPrompt.ask',
};

/**
 * 为纯文本划词场景构建最终提示词。
 *
 * @param input - 划词内容、动作与来源上下文。
 * @returns 发送给模型的完整提示词文本。
 */
export function buildSelectionPrompt(input: SelectionPromptInput): string {
  const t = input.t ?? promptBuilderFallbackT;
  const action = normalizeAction(input.action);
  const targetLanguage = detectTargetLang(input.text, t);
  const source = formatSelectionSource(input.source?.url ?? '', input.source?.title ?? '', t);
  return t(SELECTION_PROMPT_KEYS[action], { text: input.text, targetLanguage, source });
}

// ── Page style signals context（页面设计信号上下文） ────────────────────────

/**
 * 页面设计信号上下文提示词输入。
 */
export interface PageStyleSignalsContextPromptInput {
  /**
   * 页面来源信息。
   */
  source?: PromptSource;
  /**
   * 结构化设计信号。
   */
  signals: PageStyleSignalsPayload;
  /**
   * 最终输出格式。
   */
  format?: 'markdown' | 'text';
  /** 当前 UI 语言；browser-context 调用方必须显式传入，纯函数直调时归一到产品默认 prompt 语言。 */
  language?: string | null;
}

/**
 * 将布尔信号转成稳定的本地化标签。
 *
 * @param value - 布尔值。
 * @param positive - 为真时的文案。
 * @param negative - 为假时的文案。
 * @returns 归一化后的标签。
 */
function formatBooleanLabel(value: boolean, positive: string, negative: string): string {
  return value ? positive : negative;
}

/**
 * 将列表信号格式化成可读文本。
 *
 * @param values - 原始列表。
 * @param copy - 当前 prompt 语言的文案集合。
 * @returns 逗号分隔后的文本。
 */
function formatSignalList(
  values: Array<string | number | null | undefined>,
  copy: PageStylePromptCopy,
): string {
  const normalized = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized.join(copy.listSeparator) : copy.fallback;
}

/**
 * 构建页面设计信号的上下文提示词。
 *
 * 说明：
 * - 这是 `browser-context` 注入链路使用的上下文 prompt，不再驱动模型“立即产出分析报告”；
 * - 目标是为用户后续主动询问“这个页面是什么风格 / 配色如何 / UI 有何特点”时补充事实基础；
 * - 明确告诉模型这是一份近似设计信号，而不是截图，避免把未见像素效果写成事实。
 *
 * @param input - 页面来源、信号与输出格式。
 * @returns 可直接拼接到 system prompt 的上下文片段。
 */
export function buildPageStyleSignalsContextPrompt(input: PageStyleSignalsContextPromptInput): string {
  const { signals } = input;
  const language = normalizePromptLanguage(input.language);
  const copy = PAGE_STYLE_PROMPT_COPY[language];
  const source = formatPageStyleSource(input.source?.url ?? '', input.source?.title ?? '', copy);
  const label = copy.labels;
  const sections = [
    input.format === 'markdown' ? copy.headingMarkdown : copy.headingText,
    ...copy.intro,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.pageSection}` : `${copy.pageSection}:`,
    `- ${label.backgroundColor}: ${signals.page.backgroundColor || copy.fallback}`,
    `- ${label.textColor}: ${signals.page.textColor || copy.fallback}`,
    `- ${label.linkColor}: ${signals.page.linkColor || copy.fallback}`,
    `- ${label.primaryButtonColor}: ${signals.page.primaryButtonColor || copy.fallback}`,
    `- ${label.borderColors}: ${formatSignalList(signals.page.borderColors, copy)}`,
    `- ${label.shadowSamples}: ${formatSignalList(signals.page.shadowSamples, copy)}`,
    `- ${label.radiusSamples}: ${formatSignalList(signals.page.radiusSamples, copy)}`,
    `- ${label.maxContentWidth}: ${signals.page.maxContentWidth ? `${signals.page.maxContentWidth}px` : copy.fallback}`,
    `- ${label.layoutTendency}: ${formatBooleanLabel(signals.page.centeredLayout, copy.booleans.centeredLayout.yes, copy.booleans.centeredLayout.no)} / ${formatBooleanLabel(signals.page.airyWhitespace, copy.booleans.airyWhitespace.yes, copy.booleans.airyWhitespace.no)}`,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.typographySection}` : `${copy.typographySection}:`,
    `- ${label.bodyFont}: ${formatSignalList(signals.typography.bodyFontFamilies, copy)}`,
    `- ${label.headingFont}: ${formatSignalList(signals.typography.headingFontFamilies, copy)}`,
    `- ${label.buttonFont}: ${formatSignalList(signals.typography.buttonFontFamilies, copy)}`,
    `- ${label.bodySpec}: ${signals.typography.bodyFontSize || copy.fallback} / ${label.lineHeight} ${signals.typography.bodyLineHeight || copy.fallback}`,
    `- ${label.headingSizes}: ${formatSignalList(signals.typography.headingFontSizes, copy)}`,
    `- ${label.buttonSizes}: ${formatSignalList(signals.typography.buttonFontSizes, copy)}`,
    `- ${label.fontWeights}: ${formatSignalList(signals.typography.fontWeights, copy)}`,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.layoutSection}` : `${copy.layoutSection}:`,
    `- ${label.hero}: ${formatBooleanLabel(signals.layout.hasHero, copy.booleans.exists.yes, copy.booleans.exists.no)}`,
    `- ${label.navStyle}: ${signals.layout.navStyle || copy.fallback}`,
    `- ${label.sectionCount}: ${signals.layout.sectionCount}`,
    `- ${label.sectionGaps}: ${formatSignalList(signals.layout.sectionGapSamples.map((value) => `${value}px`), copy)}`,
    `- ${label.cardGrid}: ${signals.layout.cardGridHint || copy.fallback}`,
    `- ${label.imageDensity}: ${signals.layout.imageDensity}`,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.componentsSection}` : `${copy.componentsSection}:`,
    `- ${label.buttonStyles}: ${formatSignalList(signals.components.buttonStyles, copy)}`,
    `- ${label.cardStyles}: ${formatSignalList(signals.components.cardStyles, copy)}`,
    `- ${label.inputStyles}: ${formatSignalList(signals.components.inputStyles, copy)}`,
    `- ${label.tagStyles}: ${formatSignalList(signals.components.tagStyles, copy)}`,
    `- ${label.navStyles}: ${formatSignalList(signals.components.navStyles, copy)}`,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.decorationSection}` : `${copy.decorationSection}:`,
    `- ${label.largeImages}: ${formatBooleanLabel(signals.decoration.hasLargeImages, copy.booleans.obviousExists.yes, copy.booleans.obviousExists.no)}`,
    `- ${label.gradients}: ${formatBooleanLabel(signals.decoration.usesGradients, copy.booleans.exists.yes, copy.booleans.exists.no)}`,
    `- ${label.illustrations}: ${formatBooleanLabel(signals.decoration.usesIllustrations, copy.booleans.exists.yes, copy.booleans.exists.no)}`,
    `- ${label.borders}: ${formatBooleanLabel(signals.decoration.usesBorders, copy.booleans.obviousUses.yes, copy.booleans.obviousUses.no)}`,
    `- ${label.glass}: ${formatBooleanLabel(signals.decoration.usesGlass, copy.booleans.exists.yes, copy.booleans.exists.no)}`,
    `- ${label.shadows}: ${formatBooleanLabel(signals.decoration.usesShadows, copy.booleans.obviousUses.yes, copy.booleans.obviousUses.no)}`,
    `- ${label.stickyHeader}: ${formatBooleanLabel(signals.decoration.hasStickyHeader, copy.booleans.exists.yes, copy.booleans.exists.no)}`,
    input.format === 'markdown' ? '' : '\n',
    input.format === 'markdown' ? `### ${copy.samplesSection}` : `${copy.samplesSection}:`,
    `- ${label.headingSamples}: ${formatSignalList(signals.samples.headings, copy)}`,
    `- ${label.sectionSamples}: ${formatSignalList(signals.samples.sectionSelectors, copy)}`,
    `- ${label.cardSamples}: ${formatSignalList(signals.samples.cardSelectors, copy)}`,
    source ? source.trimStart() : '',
  ];

  return sections.filter(Boolean).join('\n');
}
