/**
 * 说明：`LaunchpadDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载 `LaunchpadDialog.spec` 相关的当前文件实现与模块边界；
 * - 为启动台入口渲染提供回归保护，避免已下线入口重新出现；
 *
 * 边界：
 * - 本文件只覆盖启动台卡片渲染，不扩展到页面级路由编排测试。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LaunchpadDialog } from './LaunchpadDialog';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const messages: Record<string, string> = {
          'launchpad.title': '启动台',
          'launchpad.description': '快速进入常用模块。',
          'launchpad.sections.apps': '模块',
          'launchpad.items.store': '助手商店',
          'launchpad.items.translate': '翻译',
          'launchpad.items.files': '文件',
          'launchpad.items.paint': '绘画',
          'launchpad.hints.store': '浏览/管理 AI 助手',
          'launchpad.hints.translate': '快速翻译与润色',
          'launchpad.hints.files': '管理附件与导出文件',
          'launchpad.hints.paint': '文生图 / 图生图工作台',
        };
        return messages[key] ?? key;
      },
    }),
  };
});

describe('LaunchpadDialog', () => {
  it('只展示当前保留的 4 个入口，不再渲染视频卡片', () => {
    render(<LaunchpadDialog open onClose={() => {}} onOpenTarget={() => {}} />);

    expect(screen.getByText('助手商店')).toBeInTheDocument();
    expect(screen.getByText('翻译')).toBeInTheDocument();
    expect(screen.getByText('文件')).toBeInTheDocument();
    expect(screen.getByText('绘画')).toBeInTheDocument();
    expect(screen.queryByText('视频')).not.toBeInTheDocument();
    expect(screen.queryByText('独立的文生视频工作台')).not.toBeInTheDocument();
  });
});
