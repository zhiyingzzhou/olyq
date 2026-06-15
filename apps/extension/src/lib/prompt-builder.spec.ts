/**
 * 说明：`prompt-builder.spec` 测试模块。
 *
 * 职责：
 * - 覆盖页面设计信号上下文提示词的结构约束；
 * - 防止后续把“风格信号上下文”重新写回成“立刻输出分析报告”的任务型 prompt；
 * - 作为 browser-context 风格模式的提示词契约回归。
 *
 * 边界：
 * - 本文件只验证提示词文本结构，不覆盖 SW/UI 的消息编排；
 * - 不依赖真实模型调用，仅断言关键输出要求是否被编码进 prompt。
 */
import { describe, expect, it } from 'vitest';

import { buildPageStyleSignalsContextPrompt } from './prompt-builder';

describe('buildPageStyleSignalsContextPrompt', () => {
  it('为 markdown 模式生成强调近似边界与设计信号的上下文 prompt', () => {
    const prompt = buildPageStyleSignalsContextPrompt({
      source: {
        title: 'Signal Only',
        url: 'https://example.com/signal',
      },
      signals: {
        title: 'Signal Only',
        url: 'https://example.com/signal',
        pageFingerprint: 'signal-only-fingerprint',
        routeKey: 'https://example.com/signal',
        stableWindowVersion: 1,
        extractedAt: 1,
        page: {
          backgroundColor: 'rgb(250, 248, 240)',
          textColor: 'rgb(32, 32, 32)',
          linkColor: 'rgb(60, 90, 220)',
          primaryButtonColor: 'rgb(20, 120, 230)',
          borderColors: ['rgb(220, 220, 220)'],
          shadowSamples: ['0 8px 24px rgba(0,0,0,0.12)'],
          radiusSamples: ['24px'],
          maxContentWidth: 1200,
          centeredLayout: true,
          airyWhitespace: true,
        },
        typography: {
          bodyFontFamilies: ['Inter, sans-serif'],
          headingFontFamilies: ['"Playfair Display", serif'],
          buttonFontFamilies: ['Inter, sans-serif'],
          bodyFontSize: '16px',
          bodyLineHeight: '24px',
          headingFontSizes: ['48px', '32px'],
          buttonFontSizes: ['14px'],
          fontWeights: ['400', '600', '700'],
        },
        layout: {
          hasHero: true,
          navStyle: 'sticky-top ; bg:rgba(255, 255, 255, 0.8)',
          sectionCount: 4,
          sectionGapSamples: [96, 128],
          cardGridHint: 'multi-column-grid',
          imageDensity: 'medium',
        },
        components: {
          buttonStyles: ['bg:rgb(20, 120, 230)'],
          cardStyles: ['bg:rgba(255, 255, 255, 0.85)'],
          inputStyles: ['border:rgb(220, 220, 220)'],
          tagStyles: ['radius:999px'],
          navStyles: ['shadow:0 8px 24px rgba(0,0,0,0.12)'],
        },
        decoration: {
          hasLargeImages: true,
          usesGradients: true,
          usesIllustrations: true,
          usesBorders: true,
          usesGlass: true,
          usesShadows: true,
          hasStickyHeader: true,
        },
        samples: {
          headings: ['Hero title', 'Feature grid'],
          sectionSelectors: ['header', 'main', 'section'],
          cardSelectors: ['div', 'article'],
        },
      },
      format: 'markdown',
    });

    expect(prompt).toContain('## 页面设计信号');
    expect(prompt).toContain('不是截图');
    expect(prompt).toContain('主背景色: rgb(250, 248, 240)');
    expect(prompt).toContain('Hero: 存在');
    expect(prompt).toContain('来源: Signal Only');
  });

  it('为 text 模式生成更紧凑的上下文 prompt', () => {
    const prompt = buildPageStyleSignalsContextPrompt({
      signals: {
        title: 'Compact',
        url: 'https://example.com/compact',
        pageFingerprint: 'compact-fingerprint',
        routeKey: 'https://example.com/compact',
        stableWindowVersion: 1,
        extractedAt: 2,
        page: {
          backgroundColor: 'rgb(255, 255, 255)',
          textColor: 'rgb(17, 17, 17)',
          linkColor: 'rgb(0, 102, 204)',
          primaryButtonColor: 'rgb(20, 120, 230)',
          borderColors: [],
          shadowSamples: [],
          radiusSamples: [],
          maxContentWidth: null,
          centeredLayout: false,
          airyWhitespace: false,
        },
        typography: {
          bodyFontFamilies: ['system-ui'],
          headingFontFamilies: ['system-ui'],
          buttonFontFamilies: ['system-ui'],
          bodyFontSize: '15px',
          bodyLineHeight: '22px',
          headingFontSizes: [],
          buttonFontSizes: [],
          fontWeights: ['400'],
        },
        layout: {
          hasHero: false,
          navStyle: '',
          sectionCount: 2,
          sectionGapSamples: [],
          cardGridHint: 'single-column',
          imageDensity: 'low',
        },
        components: {
          buttonStyles: [],
          cardStyles: [],
          inputStyles: [],
          tagStyles: [],
          navStyles: [],
        },
        decoration: {
          hasLargeImages: false,
          usesGradients: false,
          usesIllustrations: false,
          usesBorders: false,
          usesGlass: false,
          usesShadows: false,
          hasStickyHeader: false,
        },
        samples: {
          headings: [],
          sectionSelectors: ['main'],
          cardSelectors: [],
        },
      },
      format: 'text',
    });

    expect(prompt).toContain('【页面设计信号】');
    expect(prompt).toContain('页面:');
    expect(prompt).toContain('布局倾向: 非居中布局 / 留白偏紧');
    expect(prompt).toContain('装饰:');
  });

  it('英文语言下生成英文页面设计信号模板', () => {
    const prompt = buildPageStyleSignalsContextPrompt({
      language: 'en-US',
      source: {
        title: 'Compact',
        url: 'https://example.com/compact',
      },
      signals: {
        title: 'Compact',
        url: 'https://example.com/compact',
        pageFingerprint: 'compact-fingerprint',
        routeKey: 'https://example.com/compact',
        stableWindowVersion: 1,
        extractedAt: 2,
        page: {
          backgroundColor: 'rgb(255, 255, 255)',
          textColor: 'rgb(17, 17, 17)',
          linkColor: 'rgb(0, 102, 204)',
          primaryButtonColor: 'rgb(20, 120, 230)',
          borderColors: [],
          shadowSamples: [],
          radiusSamples: [],
          maxContentWidth: null,
          centeredLayout: false,
          airyWhitespace: false,
        },
        typography: {
          bodyFontFamilies: ['system-ui'],
          headingFontFamilies: ['system-ui'],
          buttonFontFamilies: ['system-ui'],
          bodyFontSize: '15px',
          bodyLineHeight: '22px',
          headingFontSizes: [],
          buttonFontSizes: [],
          fontWeights: ['400'],
        },
        layout: {
          hasHero: false,
          navStyle: '',
          sectionCount: 2,
          sectionGapSamples: [],
          cardGridHint: 'single-column',
          imageDensity: 'low',
        },
        components: {
          buttonStyles: [],
          cardStyles: [],
          inputStyles: [],
          tagStyles: [],
          navStyles: [],
        },
        decoration: {
          hasLargeImages: false,
          usesGradients: false,
          usesIllustrations: false,
          usesBorders: false,
          usesGlass: false,
          usesShadows: false,
          hasStickyHeader: false,
        },
        samples: {
          headings: [],
          sectionSelectors: ['main'],
          cardSelectors: [],
        },
      },
      format: 'markdown',
    });

    expect(prompt).toContain('## Page Design Signals');
    expect(prompt).toContain('not a screenshot');
    expect(prompt).toContain('Primary background color: rgb(255, 255, 255)');
    expect(prompt).toContain('Layout tendency: not centered / tight whitespace');
    expect(prompt).toContain('Source: Compact');
    expect(prompt).not.toContain('页面设计信号');
  });
});
