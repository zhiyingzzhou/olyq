/**
 * 说明：`ModelManagerApiKeyDialog.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 API Key 列表中失败连通性状态的错误展示；
 * - 守住“最终文案 + 显式详情弹窗 + 可复制完整错误”的交互约束。
 *
 * 边界：
 * - 本文件只验证 API Key 列表里的失败错误展示，不扩散到编辑、新增或批量检查流程。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModelManagerApiKeyDialog } from './ModelManagerApiKeyDialog';
import { maskApiKeyForUi } from './shared';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  const translations: Record<string, string> = {
    'common.dialogContent': 'dialog-content',
    'common.close': '关闭',
    'common.add': '添加',
    'common.copy': '复制',
    'common.copied': '已复制',
    'common.copyFailed': '复制失败',
    'common.edit': '编辑',
    'common.delete': '删除',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.show': '显示',
    'common.hide': '隐藏',
    'message.details': '详情',
    'message.errorDetails': '错误详情',
    'modelManagerPanel.apiKey.listTitle': 'API Key 列表',
    'modelManagerPanel.apiKey.listDescription': '管理 API Key',
    'modelManagerPanel.apiKey.checkModel': '检测模型',
    'modelManagerPanel.apiKey.removeInvalidTitle': '移除无效 Key',
    'modelManagerPanel.apiKey.removeInvalid': '移除无效',
    'modelManagerPanel.apiKey.checkAllTitle': '检测全部',
    'modelManagerPanel.apiKey.checkAll': '检测全部',
    'modelManagerPanel.apiKey.bulkPlaceholder': '输入 API Key',
    'modelManagerPanel.apiKey.empty': '暂无 API Key',
    'modelManagerPanel.apiKey.rotationHint': '建议定期轮换 API Key',
    'modelManagerPanel.apiKey.checkOne': '检测当前 Key',
    'modelManagerPanel.healthDialog.noModels': '暂无模型',
    'errors.apiCallHttpError': 'API 调用失败（HTTP {{status}}）',
    'errors.apiCallHttpErrorWithDetail': 'API 调用失败（HTTP {{status}}）：{{detail}}',
  };

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        const template = translations[key] ?? key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
      },
    }),
  };
});

describe('ModelManagerApiKeyDialog', () => {
  it('自定义 p-0 dialog 仍会补回标题区内边距，并把状态点和密钥文本放在同一行元信息区', () => {
    render(
      <ModelManagerApiKeyDialog
        open
        providerName="OpenAI"
        apiKeyListOpen
        apiKeyEditing={null}
        apiKeyEditingVisible={false}
        apiKeys={['sk-test-1']}
        apiKeyConnectivity={{
          'sk-test-1': {
            status: 'not_checked',
          },
        }}
        apiKeyCheckModelId="gpt-5.1"
        apiKeyCheckModelCandidates={[{ id: 'gpt-5.1', name: 'GPT-5.1' }]}
        isAnyApiKeyChecking={false}
        invalidApiKeyCount={0}
        onClose={vi.fn()}
        onSetOpen={vi.fn()}
        onBeginAddApiKey={vi.fn()}
        onBeginEditApiKey={vi.fn()}
        onCancelEdit={vi.fn()}
        onSaveEdit={vi.fn()}
        onSetEditingValue={vi.fn()}
        onToggleEditingVisibility={vi.fn()}
        onRunAllChecks={vi.fn()}
        onRunCheck={vi.fn()}
        onRemoveInvalid={vi.fn()}
        onRemoveAt={vi.fn()}
        onCopyKey={vi.fn()}
        onSetCheckModelId={vi.fn()}
        onSetApiKeyListOpen={vi.fn()}
        apiKeyInputRef={{ current: null }}
      />,
    );

    const title = screen.getByRole('heading', { name: 'API Key 列表 · OpenAI' });
    const header = title.parentElement;
    const maskedKey = screen.getByText(maskApiKeyForUi('sk-test-1'));
    const keyMetaRow = document.body.querySelector('[data-olyq-api-key-row="meta"]');
    const statusDot = document.body.querySelector('[data-olyq-api-key-status="indicator"]');
    const copyButton = screen.getByRole('button', { name: '复制' });
    const copyIcon = copyButton.querySelector('svg');

    expect(header).not.toBeNull();
    expect(header?.className).toContain('px-6');
    expect(header?.className).toContain('pt-6');
    expect(header?.className).toContain('pb-3');
    expect(keyMetaRow).not.toBeNull();
    expect(keyMetaRow).toContain(maskedKey);
    expect(keyMetaRow).toContain(statusDot);
    expect(copyIcon?.classList.contains('lucide-copy')).toBe(true);
  });

  it('失败连通性只有摘要时，不会渲染冗余详情按钮', () => {
    const errorText = 'API 调用失败（HTTP 400）';

    render(
      <ModelManagerApiKeyDialog
        open
        providerName="OpenAI"
        apiKeyListOpen
        apiKeyEditing={null}
        apiKeyEditingVisible={false}
        apiKeys={['sk-test-1']}
        apiKeyConnectivity={{
          'sk-test-1': {
            status: 'failed',
            error: {
              key: 'errors.apiCallHttpError',
              params: {
                status: 400,
              },
            },
          },
        }}
        apiKeyCheckModelId="text-embedding-3-large"
        apiKeyCheckModelCandidates={[{ id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' }]}
        isAnyApiKeyChecking={false}
        invalidApiKeyCount={1}
        onClose={vi.fn()}
        onSetOpen={vi.fn()}
        onBeginAddApiKey={vi.fn()}
        onBeginEditApiKey={vi.fn()}
        onCancelEdit={vi.fn()}
        onSaveEdit={vi.fn()}
        onSetEditingValue={vi.fn()}
        onToggleEditingVisibility={vi.fn()}
        onRunAllChecks={vi.fn()}
        onRunCheck={vi.fn()}
        onRemoveInvalid={vi.fn()}
        onRemoveAt={vi.fn()}
        onCopyKey={vi.fn()}
        onSetCheckModelId={vi.fn()}
        onSetApiKeyListOpen={vi.fn()}
        apiKeyInputRef={{ current: null }}
      />,
    );

    expect(screen.getByText(errorText)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  });

  it('失败连通性的摘要和技术详情不同时，仍会显示详情按钮并展示可复制详情', () => {
    const errorDetail = 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1';

    render(
      <ModelManagerApiKeyDialog
        open
        providerName="OpenAI"
        apiKeyListOpen
        apiKeyEditing={null}
        apiKeyEditingVisible={false}
        apiKeys={['sk-test-1']}
        apiKeyConnectivity={{
          'sk-test-1': {
            status: 'failed',
            error: {
              key: 'errors.apiCallHttpError',
              params: {
                status: 400,
              },
            },
            errorDetail,
          },
        }}
        apiKeyCheckModelId="gpt-5.1"
        apiKeyCheckModelCandidates={[{ id: 'gpt-5.1', name: 'GPT-5.1' }]}
        isAnyApiKeyChecking={false}
        invalidApiKeyCount={1}
        onClose={vi.fn()}
        onSetOpen={vi.fn()}
        onBeginAddApiKey={vi.fn()}
        onBeginEditApiKey={vi.fn()}
        onCancelEdit={vi.fn()}
        onSaveEdit={vi.fn()}
        onSetEditingValue={vi.fn()}
        onToggleEditingVisibility={vi.fn()}
        onRunAllChecks={vi.fn()}
        onRunCheck={vi.fn()}
        onRemoveInvalid={vi.fn()}
        onRemoveAt={vi.fn()}
        onCopyKey={vi.fn()}
        onSetCheckModelId={vi.fn()}
        onSetApiKeyListOpen={vi.fn()}
        apiKeyInputRef={{ current: null }}
      />,
    );

    expect(screen.getByText('API 调用失败（HTTP 400）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('端点/codex未开启模型gpt-5.1'))).toBeInTheDocument();
  });

  it('失败连通性即使只有技术详情，也会把 detail 作为行内摘要展示', () => {
    const errorDetail = 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1';

    render(
      <ModelManagerApiKeyDialog
        open
        providerName="OpenAI"
        apiKeyListOpen
        apiKeyEditing={null}
        apiKeyEditingVisible={false}
        apiKeys={['sk-test-1']}
        apiKeyConnectivity={{
          'sk-test-1': {
            status: 'failed',
            errorDetail,
          },
        }}
        apiKeyCheckModelId="gpt-5.1"
        apiKeyCheckModelCandidates={[{ id: 'gpt-5.1', name: 'GPT-5.1' }]}
        isAnyApiKeyChecking={false}
        invalidApiKeyCount={1}
        onClose={vi.fn()}
        onSetOpen={vi.fn()}
        onBeginAddApiKey={vi.fn()}
        onBeginEditApiKey={vi.fn()}
        onCancelEdit={vi.fn()}
        onSaveEdit={vi.fn()}
        onSetEditingValue={vi.fn()}
        onToggleEditingVisibility={vi.fn()}
        onRunAllChecks={vi.fn()}
        onRunCheck={vi.fn()}
        onRemoveInvalid={vi.fn()}
        onRemoveAt={vi.fn()}
        onCopyKey={vi.fn()}
        onSetCheckModelId={vi.fn()}
        onSetApiKeyListOpen={vi.fn()}
        apiKeyInputRef={{ current: null }}
      />,
    );

    expect(screen.getByText(errorDetail)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  });
});
