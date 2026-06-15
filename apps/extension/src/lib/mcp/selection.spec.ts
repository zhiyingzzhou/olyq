/**
 * 说明：`selection.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `selection.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import {
  createAutoMcpServerSelection,
  createDisabledMcpServerSelection,
  createManualMcpServerSelection,
  resolveSelectedMcpServerIds,
  sanitizeMcpServerSelection,
} from './selection';

describe('mcp selection helpers', () => {
  it('normalizes manual selections and removes duplicate ids', () => {
    expect(createManualMcpServerSelection([' alpha ', 'beta', 'alpha', ''])).toEqual({
      mode: 'manual',
      manualServerIds: ['alpha', 'beta'],
    });
  });

  it('resolves selected server ids without treating auto as all servers', () => {
    expect(resolveSelectedMcpServerIds(createAutoMcpServerSelection(), ['s1', 's2', 's1'])).toEqual([]);
    expect(resolveSelectedMcpServerIds(createDisabledMcpServerSelection(), ['s1', 's2'])).toEqual([]);
    expect(resolveSelectedMcpServerIds(createManualMcpServerSelection(['s2']), ['s1', 's2'])).toEqual(['s2']);
  });

  it('sanitizes invalid payloads to fallback mode', () => {
    expect(sanitizeMcpServerSelection({ mode: 'manual', manualServerIds: ['a', 'a', ' b '] }, 'disabled')).toEqual({
      mode: 'manual',
      manualServerIds: ['a', 'b'],
    });
    expect(sanitizeMcpServerSelection({ mode: 'wat' }, 'disabled')).toEqual({
      mode: 'disabled',
      manualServerIds: [],
    });
  });
});
