/**
 * 说明：远端备份版本弹窗组件测试。
 *
 * 职责：
 * - 锁定 WebDAV / S3 共用备份版本弹窗的紧凑列表视觉契约；
 * - 防止 icon-only 操作在打开时抢首焦点并直接弹出 tooltip；
 * - 确认删除这类次级操作继续由 TooltipAction 提供可访问名称。
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { RemoteBackupVersionsDialog } from './RemoteBackupVersionsDialog';
import type { RemoteBackupVersion } from './shared-utils';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'cloudSyncPanel.remoteBackups.count') return `${String(params?.count ?? 0)} 个备份快照`;
        if (key === 'cloudSyncPanel.actions.restore') return '从备份快照恢复';
        if (key === 'cloudSyncPanel.liteBackup.title') return '精简备份';
        if (key === 'common.refresh') return '刷新';
        if (key === 'common.delete') return '删除';
        if (key === 'common.loading') return '加载中';
        if (key === 'cloudSyncPanel.remoteBackups.empty') return '暂无远端备份快照。';
        if (key === 'cloudSyncPanel.remoteBackups.unknownTime') return '时间未知';
        return key;
      },
    }),
  };
});

const versions: RemoteBackupVersion[] = [
  {
    name: 'olyq-backup-20260502051208108.zip',
    key: 'olyq/olyq-backup-20260502051208108.zip',
    url: 'https://dav.example.com/olyq/olyq-backup-20260502051208108.zip',
    lastModified: Date.UTC(2026, 4, 2, 5, 12, 8),
    size: 4_312_052,
    profile: 'full',
  },
  {
    name: 'olyq-backup-20260501182233456-lite.zip',
    key: 'olyq/olyq-backup-20260501182233456-lite.zip',
    url: 'https://dav.example.com/olyq/olyq-backup-20260501182233456-lite.zip',
    lastModified: Date.UTC(2026, 4, 1, 18, 22, 33),
    size: 882_140,
    profile: 'lite',
  },
];

describe('RemoteBackupVersionsDialog', () => {
  it('保持设置页紧凑列表样式，并把初始焦点放在标题区而不是刷新按钮', async () => {
    render(
      <RemoteBackupVersionsDialog
        open
        onOpenChange={vi.fn()}
        title="远端备份版本"
        description="选择要恢复的 ZIP 快照。"
        items={versions}
        loading={false}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    const title = screen.getByText('远端备份版本');
    const headerFocusTarget = title.closest('[tabindex="-1"]');
    expect(headerFocusTarget).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    const scrollArea = dialog.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toHaveClass('h-[min(360px,calc(100vh-12rem))]', 'min-h-[184px]');

    const rows = within(dialog).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass('grid', 'rounded-md', 'px-3', 'py-2.5');
    expect(within(rows[0]!).getByText('4.1 MB')).toHaveClass('rounded-sm', 'bg-muted/60');
    expect(within(rows[1]!).getByText('精简备份')).toHaveClass('bg-primary/10', 'text-primary');
  });

  it('删除保持 icon-only 次级操作，并通过 tooltip contract 暴露可访问名称', async () => {
    render(
      <RemoteBackupVersionsDialog
        open
        onOpenChange={vi.fn()}
        title="远端备份版本"
        description="选择要恢复的 ZIP 快照。"
        items={versions}
        loading={false}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: '刷新' })).toHaveClass('h-8', 'w-8', 'p-0');
    const deleteButtons = screen.getAllByRole('button', { name: '删除' });
    expect(deleteButtons).toHaveLength(2);
    for (const button of deleteButtons) {
      expect(button).toHaveClass('h-8', 'w-8', 'p-0');
    }
  });
});
