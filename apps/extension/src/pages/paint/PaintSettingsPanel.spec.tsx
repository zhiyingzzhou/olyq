/**
 * 说明：PaintSettingsPanel 能力驱动参数测试。
 *
 * 职责：
 * - 覆盖 size、aspectRatio、quality、seed 按能力显示与枚举选择；
 * - 覆盖高级 providerOptions JSON 错误展示；
 * - 守住生成态禁用行为，避免生成过程中继续修改参数。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Painting } from '@/hooks/usePaintStore';
import { resolveImageGenerationCapability, type ImageGenerationCapability } from '@/lib/ai/image-generation-params';

import { PaintSettingsPanel } from './PaintSettingsPanel';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'paint.advancedProviderOptionsPlaceholder') return `{"${String(params?.provider ?? 'provider')}":{}}`;
        if (key === 'paint.advancedProviderOptionsHint') return `Allowed: ${String(params?.providers ?? '')}`;
        if (key === 'paint.advancedProviderOptionsHelp') return 'Native provider fields help';
        if (key === 'paint.advancedProviderOptionsDescription') return 'Native provider JSON description';
        if (key === 'paint.advancedProviderOptionsReservedHint') return 'Do not override standard fields';
        if (key === 'paint.allowedNamespaces') return 'Allowed namespaces';
        if (key === 'paint.jsonObject') return 'JSON object';
        if (key === 'paint.leaveBlankAllowed') return 'Blank is OK';
        return key;
      },
    }),
  };
});

const BASE_CAPABILITY = resolveImageGenerationCapability({
  providerType: 'openai',
  providerId: 'openai',
  modelId: 'gpt-image-1',
});

/**
 * 构造最小绘画记录，供设置面板测试使用。
 *
 * @returns PaintSettingsPanel 可消费的绘画记录。
 */
function createPainting(): Painting {
  return {
    id: 'paint-1',
    title: 'Paint 1',
    model: 'openai/gpt-image-1',
    prompt: '',
    params: { n: 1 },
    inputImages: [],
    outputImages: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

/**
 * PaintSettingsPanel 测试装配。
 *
 * @param props - 生成态与参数回调覆盖项。
 * @returns 带本地受控状态的设置面板。
 */
function PanelHarness({
  isGenerating = false,
  onSizeChange = vi.fn(),
  onAspectRatioChange = vi.fn(),
  onQualityChange = vi.fn(),
  onProviderOptionsJsonChange = vi.fn(),
  capability = BASE_CAPABILITY,
  providerOptionsJsonError,
}: {
  readonly isGenerating?: boolean;
  readonly onSizeChange?: (value: string) => void;
  readonly onAspectRatioChange?: (value: string) => void;
  readonly onQualityChange?: (value: string) => void;
  readonly onProviderOptionsJsonChange?: (value: string) => void;
  readonly capability?: ImageGenerationCapability;
  readonly providerOptionsJsonError?: string;
}) {
  const [active, setActive] = useState<Painting>(createPainting);
  const inputFileRef = useRef<HTMLInputElement>(null);

  return (
    <PaintSettingsPanel
      active={active}
      inputDropActive={false}
      inputFileRef={inputFileRef}
      isGenerating={isGenerating}
      modelLabel="GPT Image"
      capability={capability}
      providerOptionsJsonError={providerOptionsJsonError}
      onAspectRatioChange={(value) => {
        onAspectRatioChange(value);
        setActive((prev) => ({ ...prev, params: { ...prev.params, aspectRatio: value } }));
      }}
      onCountChange={() => undefined}
      onDropFiles={() => undefined}
      onInputFileChange={() => undefined}
      onOpenInputFilePicker={() => undefined}
      onOpenModelPicker={() => undefined}
      onProviderOptionsJsonChange={(value) => {
        onProviderOptionsJsonChange(value);
        setActive((prev) => ({ ...prev, params: { ...prev.params, providerOptionsJson: value } }));
      }}
      onQualityChange={(value) => {
        onQualityChange(value);
        setActive((prev) => ({ ...prev, params: { ...prev.params, quality: value } }));
      }}
      onRemoveInput={() => undefined}
      onSeedChange={() => undefined}
      onSetDropActive={() => undefined}
      onSizeChange={(value) => {
        onSizeChange(value);
        setActive((prev) => ({ ...prev, params: { ...prev.params, size: value } }));
      }}
    />
  );
}

describe('PaintSettingsPanel', () => {
  it('只为 supported 参数渲染帮助提示', () => {
    const { container } = render(<PanelHarness />);

    expect(screen.queryByRole('button', { name: 'paint.paramHelp.count' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'paint.paramHelp.seed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'paint.paramHelp.size' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'paint.paramHelp.aspectRatio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'paint.paramHelp.quality' })).toBeInTheDocument();

    expect(screen.getByTestId('paint-settings-panel')).toHaveAttribute('data-paint-settings-panel');
    expect(container.querySelector('.paint-settings-row')).toBeTruthy();
    expect(container.querySelector('.paint-settings-control')).toBeTruthy();
    expect(container.querySelector('.paint-input-images-header')).toBeTruthy();
    expect(container.querySelector('.paint-input-images-actions')).toBeTruthy();
  });

  it('size 参数可以从推荐下拉列表选择', async () => {
    const user = userEvent.setup();
    const onSizeChange = vi.fn();
    render(<PanelHarness onSizeChange={onSizeChange} />);

    await user.click(screen.getByRole('textbox', { name: 'paint.size' }));
    await user.click(await screen.findByRole('option', { name: '1024x1024' }));

    expect(onSizeChange).toHaveBeenLastCalledWith('1024x1024');
    expect(screen.getByRole('textbox', { name: 'paint.size' })).toHaveValue('1024x1024');
  });

  it('aspectRatio 参数可以搜索后选择推荐项', async () => {
    const user = userEvent.setup();
    const onAspectRatioChange = vi.fn();
    const capability = resolveImageGenerationCapability({
      providerType: 'gemini',
      providerId: 'google',
      modelId: 'gemini-2.5-flash-image',
    });
    render(<PanelHarness capability={capability} onAspectRatioChange={onAspectRatioChange} />);

    const input = screen.getByRole('textbox', { name: 'paint.aspectRatio' });
    await user.type(input, '16');
    await user.click(await screen.findByRole('option', { name: '16:9' }));

    expect(onAspectRatioChange).toHaveBeenLastCalledWith('16:9');
    expect(input).toHaveValue('16:9');
  });

  it('quality 参数不再把自定义输入写回普通参数', async () => {
    const user = userEvent.setup();
    const onQualityChange = vi.fn();
    render(<PanelHarness onQualityChange={onQualityChange} />);

    const input = screen.getByRole('textbox', { name: 'paint.quality' });
    await user.type(input, 'ultra');

    expect(screen.queryByRole('button', { name: 'Use ultra' })).not.toBeInTheDocument();
    expect(input).toHaveValue('ultra');
    expect(onQualityChange).not.toHaveBeenCalled();
  });

  it('不支持的参数不会渲染普通输入', () => {
    const capability = resolveImageGenerationCapability({
      providerType: 'openai',
      providerId: 'openrouter',
      modelId: 'openai/gpt-image-1',
    });
    render(<PanelHarness capability={capability} />);

    expect(screen.queryByRole('textbox', { name: 'paint.size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'paint.quality' })).not.toBeInTheDocument();
  });

  it('高级 providerOptions 会显示校验错误', async () => {
    const user = userEvent.setup();
    const onProviderOptionsJsonChange = vi.fn();
    render(
      <PanelHarness
        onProviderOptionsJsonChange={onProviderOptionsJsonChange}
        providerOptionsJsonError="reserved key"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'paint.advancedProviderOptions' }));
    const textarea = screen.getByRole('textbox', { name: 'paint.advancedProviderOptions' });
    await user.click(textarea);
    await user.paste('{"openai":{"negative_prompt":"x"}}');

    expect(onProviderOptionsJsonChange).toHaveBeenCalled();
    expect(screen.getByText('Native provider JSON description')).toBeInTheDocument();
    expect(screen.getByText('Allowed namespaces')).toBeInTheDocument();
    expect(screen.getAllByText('openai').length).toBeGreaterThan(0);
    expect(screen.getByText('Do not override standard fields')).toBeInTheDocument();
    expect(textarea).toHaveAccessibleDescription(/Native provider JSON description/);
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('reserved key')).toBeInTheDocument();
  });

  it('生成中会禁用参数输入', async () => {
    const user = userEvent.setup();
    render(<PanelHarness isGenerating />);

    const input = screen.getByRole('textbox', { name: 'paint.size' });
    expect(input).toBeDisabled();

    await user.click(input);
    expect(screen.queryByRole('option', { name: '1024x1024' })).not.toBeInTheDocument();
  });
});
