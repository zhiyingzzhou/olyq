/**
 * 说明：技术栈 prompt formatter 测试。
 *
 * 职责：
 * - 验证自动上下文只注入技术栈安全摘要；
 * - 防止版本冲突、cookie 值、脚本片段等内部信号进入 AI prompt；
 * - 让 UI 展示信息和 AI 注入信息保持不同安全边界。
 */
import { describe, expect, it } from 'vitest';

import { buildTechnologyStackPrompt } from './prompt';
import type { TechnologyStackResult } from './types';

describe('technology-stack prompt', () => {
  it('不会把版本冲突摘要写入 AI prompt', () => {
    const result: TechnologyStackResult = {
      status: 'ready',
      tabId: 1,
      url: 'https://example.com/',
      title: 'Example',
      pageFingerprint: 'fingerprint',
      detectedAt: 1,
      scanCoverage: 'complete',
      technologies: [{
        name: 'Example Framework',
        slug: 'example-framework',
        categories: ['framework'],
        version: '2.0.0',
        versionReliability: 'exact',
        versionConflicts: ['headers:1.0.0', 'script-src:2.0.0'],
        confidence: 90,
        sources: ['headers', 'script-src'],
        evidence: [],
        iconCandidates: [],
        iconFallback: 'F',
      }],
    };

    const prompt = buildTechnologyStackPrompt(result);

    expect(prompt).toContain('Example Framework 2.0.0');
    expect(prompt).not.toContain('headers:1.0.0');
    expect(prompt).not.toContain('冲突');
  });

  it('英文语言下生成英文技术栈摘要模板', () => {
    const result: TechnologyStackResult = {
      status: 'ready',
      tabId: 1,
      url: 'https://example.com/',
      title: 'Example',
      pageFingerprint: 'fingerprint',
      detectedAt: 1,
      scanCoverage: 'complete',
      rulePackage: {
        total: 100,
        technologyCount: 80,
        categoryCount: 12,
        snapshotVersion: '1.0.0',
        source: 'local-fingerprint-snapshot',
        unsupportedSignals: [],
        updateChannel: 'extension-release',
      },
      technologies: [{
        name: 'Example Framework',
        slug: 'example-framework',
        categories: ['framework'],
        version: '2.0.0',
        versionReliability: 'exact',
        confidence: 90,
        sources: ['headers', 'script-src'],
        evidence: [],
        iconCandidates: [],
        iconFallback: 'F',
      }],
    };

    const prompt = buildTechnologyStackPrompt(result, { language: 'en-US' });

    expect(prompt).toContain('## Page Technology Stack Summary');
    expect(prompt).toContain('Page: Example');
    expect(prompt).toContain('Rule package: 100 entries, local snapshot 1.0.0');
    expect(prompt).toContain('confidence 90');
    expect(prompt).not.toContain('页面技术栈摘要');
  });
});
