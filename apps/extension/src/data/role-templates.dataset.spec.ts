/**
 * 说明：`role-templates.dataset.spec` 静态数据模块。
 *
 * 职责：
 * - 承载 `role-templates.dataset.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_BROWSER_PRESET_GROUPS_EN,
  APPROVED_BROWSER_PRESET_GROUPS_ZH,
  hasLegacyDisallowedPresetSignatures,
} from '@/lib/legal/preset-remediation';

type RawPreset = {
  id: string;
  name: string;
  iconId?: string;
  group?: string[];
  enableWebSearch?: boolean;
  enableGenerateImage?: boolean;
  enableMemory?: boolean;
  mcpSelection?: { mode: string; manualServerIds?: string[] };
  prompt?: string;
};

/**
 * 测试辅助函数：`readPresetFile`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readPresetFile(fileName: string): RawPreset[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(currentDir, '../..', 'public', 'data', fileName), 'utf8');
  return JSON.parse(raw) as RawPreset[];
}

const APPROVED_BROWSER_PRESET_IDS = [
  'browser-briefing',
  'browser-research',
  'browser-extractor',
  'browser-operator',
] as const;

const APPROVED_GENERAL_PRESET_IDS = [
  'draft-writer',
  'outline-architect',
  'rewrite-editor',
  'tone-polisher',
  'longform-finisher',
  'concept-tutor',
  'socratic-coach',
  'quiz-crafter',
  'study-planner',
  'code-reviewer',
  'bug-investigator',
  'refactor-planner',
  'test-designer',
  'api-designer',
  'data-interpreter',
  'decision-mapper',
  'risk-spotter',
  'root-cause-finder',
  'source-auditor',
  'project-planner',
  'meeting-synthesizer',
  'roadmap-shaper',
  'checklist-builder',
  'brainstorm-facilitator',
  'idea-evaluator',
  'name-generator',
  'story-developer',
  'email-composer',
  'presentation-builder',
  'proposal-drafter',
  'feedback-coach',
  'negotiation-prep',
  'task-prioritizer',
  'process-designer',
  'knowledge-organizer',
  'workflow-orchestrator',
] as const;

const APPROVED_GENERAL_PRESET_GROUPS_ZH = ['写作', '学习', '开发', '分析', '规划', '创意', '沟通', '效率'] as const;
const APPROVED_GENERAL_PRESET_GROUPS_EN = [
  'Writing',
  'Learning',
  'Development',
  'Analysis',
  'Planning',
  'Creativity',
  'Communication',
  'Productivity',
] as const;

describe('browser assistant preset datasets', () => {
  it('zh-CN 数据集只包含批准的浏览器场景角色与分组', () => {
    const presets = readPresetFile('assistant-presets.browser.zh-CN.json');
    expect(presets).toHaveLength(4);
    expect(presets.map((item) => item.id)).toEqual(APPROVED_BROWSER_PRESET_IDS);
    expect(hasLegacyDisallowedPresetSignatures(presets)).toBe(false);
    for (const preset of presets) {
      expect(preset.id).toMatch(/^[a-z0-9-]+$/);
      expect(preset.id).not.toMatch(/^\d+$/);
      expect(preset.prompt).toBeTruthy();
      expect(preset.iconId).toBeTruthy();
      for (const group of preset.group || []) {
        expect(APPROVED_BROWSER_PRESET_GROUPS_ZH).toContain(group as (typeof APPROVED_BROWSER_PRESET_GROUPS_ZH)[number]);
      }
    }

    expect(presets.find((item) => item.id === 'browser-research')).toMatchObject({ enableWebSearch: true });
    expect(presets.find((item) => item.id === 'browser-operator')).toMatchObject({
      mcpSelection: { mode: 'auto', manualServerIds: [] },
    });
    expect(presets.filter((item) => item.enableMemory).map((item) => item.id)).toEqual([]);
    expect(presets.filter((item) => item.enableGenerateImage).map((item) => item.id)).toEqual([]);
  });

  it('en 数据集与 zh-CN 共享同一组角色 ID，且只使用批准分组', () => {
    const zhPresets = readPresetFile('assistant-presets.browser.zh-CN.json');
    const enPresets = readPresetFile('assistant-presets.browser.en.json');

    expect(enPresets).toHaveLength(4);
    expect(enPresets.map((item) => item.id)).toEqual(zhPresets.map((item) => item.id));
    expect(hasLegacyDisallowedPresetSignatures(enPresets)).toBe(false);
    for (const preset of enPresets) {
      expect(preset.iconId).toBeTruthy();
      for (const group of preset.group || []) {
        expect(APPROVED_BROWSER_PRESET_GROUPS_EN).toContain(group as (typeof APPROVED_BROWSER_PRESET_GROUPS_EN)[number]);
      }
    }
  });
});

describe('general assistant preset datasets', () => {
  it('zh-CN 数据集只包含批准的通用角色、分组和能力开关', () => {
    const presets = readPresetFile('assistant-presets.general.zh-CN.json');

    expect(presets).toHaveLength(36);
    expect(presets.map((item) => item.id)).toEqual(APPROVED_GENERAL_PRESET_IDS);
    expect(hasLegacyDisallowedPresetSignatures(presets)).toBe(false);

    for (const preset of presets) {
      expect(preset.id).toMatch(/^[a-z0-9-]+$/);
      expect(preset.id).not.toMatch(/^\d+$/);
      expect(preset.prompt).toBeTruthy();
      expect(preset.iconId).toBeTruthy();
      for (const group of preset.group || []) {
        expect(APPROVED_GENERAL_PRESET_GROUPS_ZH).toContain(group as (typeof APPROVED_GENERAL_PRESET_GROUPS_ZH)[number]);
      }
    }

    expect(presets.filter((item) => item.enableWebSearch).map((item) => item.id)).toEqual(['source-auditor']);
    expect(presets.filter((item) => item.enableMemory).map((item) => item.id)).toEqual(['knowledge-organizer']);
    expect(
      presets
        .filter((item) => item.mcpSelection?.mode === 'auto')
        .map((item) => item.id),
    ).toEqual(['workflow-orchestrator']);
    expect(presets.filter((item) => item.enableGenerateImage).map((item) => item.id)).toEqual([]);
  });

  it('en 数据集与 zh-CN 共享同一组通用角色 ID，且只使用批准分组', () => {
    const zhPresets = readPresetFile('assistant-presets.general.zh-CN.json');
    const enPresets = readPresetFile('assistant-presets.general.en.json');

    expect(enPresets).toHaveLength(36);
    expect(enPresets.map((item) => item.id)).toEqual(zhPresets.map((item) => item.id));
    expect(hasLegacyDisallowedPresetSignatures(enPresets)).toBe(false);
    for (const preset of enPresets) {
      expect(preset.iconId).toBeTruthy();
      for (const group of preset.group || []) {
        expect(APPROVED_GENERAL_PRESET_GROUPS_EN).toContain(group as (typeof APPROVED_GENERAL_PRESET_GROUPS_EN)[number]);
      }
    }
  });
});
