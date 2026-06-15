/**
 * 说明：`topic-title.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `topic-title.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：话题标题生成的清洗与兜底策略。
 *
 * 覆盖：
 * - 去引号/符号/换行等清洗；
 * - 从 JSON 片段提取 title；
 * - 无效输出兜底到样本首条用户语句；
 * - 长度上限裁剪。
 */

import { describe, expect, it } from 'vitest';
import { finalizeTopicTitle } from './topic-title';

describe('topic-title', () => {
  it('应从纯文本输出中清洗出标题（去掉引号/句号/冒号/换行）', () => {
    const title = finalizeTopicTitle('「山水画构思：瀑布与亭台。」\n（不要输出）', '');
    expect(title).toBe('山水画构思瀑布与亭台');
  });

  it('应支持从 JSON 里提取 title 字段', () => {
    const title = finalizeTopicTitle('```json\n{ "title": "水墨山水画构思" }\n```', '');
    expect(title).toBe('水墨山水画构思');
  });

  it('当模型输出明显无效时应回退到 sample 的首条用户语句', () => {
    const sample = ['用户：画一幅山水画', '助手：（图片×1）', '助手：好的'].join('\n');
    const title = finalizeTopicTitle('[15]', sample);
    expect(title).toBe('画一幅山水画');
  });

  it('应做长度上限裁剪（18 字）', () => {
    const raw = '这是一个特别特别长的话题标题用于测试裁剪逻辑';
    const title = finalizeTopicTitle(raw, '');
    expect(title.length).toBeLessThanOrEqual(18);
    expect(title).toBe(raw.slice(0, 18));
  });
});
