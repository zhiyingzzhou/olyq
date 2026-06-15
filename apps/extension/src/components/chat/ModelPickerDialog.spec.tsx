/**
 * 说明：`ModelPickerDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ModelPickerDialog.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModelPickerDialog } from './ModelPickerDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from '@/components/ui/overlay-layers';

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'modelSelect.selectedCount') return String(params?.count ?? 0);
      if (key === 'modelRegistry.filters.all') return 'All';
      return key;
    } }),
  };
});

vi.mock('@/hooks/usePinnedModels', () => ({
  usePinnedModels: () => ({
    loading: false,
    pinnedModels: [],
    pinnedSet: new Set<string>(),
    togglePinnedModel: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
  }),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined, enabled: true },
      { id: 'anthropic', name: 'Anthropic', logo: undefined, enabled: true },
    ],
    models: [
      {
        id: 'openai/gpt-5.4',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        canonicalId: 'public::openai::gpt-5.4',
        baseModelKey: 'gpt-5.4',
        scope: 'public',
        kind: 'chat',
        primaryKindKey: 'chat',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        features: ['vision-input'],
        transportProtocol: 'openai-chat',
        confidence: 'high',
      },
      {
        id: 'openai/gpt-image-1',
        modelId: 'gpt-image-1',
        name: 'GPT Image 1',
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        canonicalId: 'public::openai::gpt-image-1',
        baseModelKey: 'gpt-image-1',
        scope: 'public',
        kind: 'image-generation',
        primaryKindKey: 'image-generation',
        inputModalities: ['text'],
        outputModalities: ['image'],
        features: ['image-output'],
        transportProtocol: 'image-api',
        confidence: 'high',
      },
      {
        id: 'anthropic/claude-sonnet-4-6',
        modelId: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        providerId: 'anthropic',
        providerName: 'Anthropic',
        providerType: 'anthropic',
        canonicalId: 'public::anthropic::claude-sonnet-4-6',
        baseModelKey: 'claude-sonnet-4-6',
        scope: 'public',
        kind: 'chat',
        primaryKindKey: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        features: [],
        transportProtocol: 'anthropic-messages',
        confidence: 'high',
      },
    ],
  }),
}));

describe('ModelPickerDialog', () => {
  it('单选模式下当前模型不再显示右侧对钩', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const option = await screen.findByRole('option', { name: /GPT-5\.4/i });
    const row = option.closest('[data-model-id="openai/gpt-5.4"]');
    expect(row).not.toBeNull();

    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(within(row as HTMLElement).queryByTestId('model-picker-selected-check')).not.toBeInTheDocument();
  });

  it('多选模式下已选模型仍显示右侧对钩', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          multiple
          values={['openai/gpt-5.4']}
          onChange={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const option = await screen.findByRole('option', { name: /GPT-5\.4/i });
    const row = option.closest('[data-model-id="openai/gpt-5.4"]');
    expect(row).not.toBeNull();

    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(within(row as HTMLElement).getByTestId('model-picker-selected-check')).toBeInTheDocument();
  });

  it('鼠标移出列表后会清理鼠标来源的 hover 高亮', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const list = await screen.findByTestId('model-picker-list');
    const option = screen.getByRole('option', { name: /Claude Sonnet 4\.6/i });

    await user.hover(option);
    expect(list).toHaveAttribute('aria-activedescendant', option.id);
    expect(option).toHaveClass('bg-accent/35');

    fireEvent.mouseLeave(list);

    await waitFor(() => {
      expect(list).not.toHaveAttribute('aria-activedescendant', option.id);
    });
    expect(option).not.toHaveClass('bg-accent/35');
  });

  it('鼠标移出列表不会清理键盘导航产生的焦点', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const searchInput = await screen.findByTestId('model-picker-search');
    const list = screen.getByTestId('model-picker-list');
    await screen.findAllByRole('option');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    let keyboardFocusedId = '';
    await waitFor(() => {
      keyboardFocusedId = list.getAttribute('aria-activedescendant') || '';
      expect(keyboardFocusedId).toBeTruthy();
    });
    const keyboardFocusedOption = document.getElementById(keyboardFocusedId);
    expect(keyboardFocusedOption).not.toBeNull();

    fireEvent.mouseLeave(list);

    expect(list).toHaveAttribute('aria-activedescendant', keyboardFocusedId);
    expect(keyboardFocusedOption).toHaveClass('bg-accent/35');
  });

  it('搜索框聚焦时仍可用方向键和回车完成键盘选择', async () => {
    const onSelect = vi.fn();

    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={onSelect}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const searchInput = await screen.findByTestId('model-picker-search');
    await screen.findAllByRole('option');
    await waitFor(() => {
      expect(searchInput).toHaveAttribute(
        'aria-activedescendant',
        screen.getByRole('option', { name: /GPT-5.4/i }).id,
      );
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(searchInput).toHaveAttribute(
        'aria-activedescendant',
        screen.getByRole('option', { name: /Claude Sonnet 4.6/i }).id,
      );
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('anthropic/claude-sonnet-4-6');
    });
  });

  it('列表会暴露 listbox/option 语义并标记当前选中项', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /GPT-5.4/i }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('顶部 Provider 筛选使用可访问 toggle 状态，并让图标保持透明保护层', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const allButton = await screen.findByTestId('model-picker-provider-filter-all');
    const openAiButton = screen.getByTestId('model-picker-provider-filter-openai');

    expect(allButton).toHaveAttribute('aria-pressed', 'true');
    expect(openAiButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(openAiButton);

    expect(allButton).toHaveAttribute('aria-pressed', 'false');
    expect(openAiButton).toHaveAttribute('aria-pressed', 'true');
    expect(openAiButton).toHaveAccessibleName('OpenAI');
    expect(openAiButton).toHaveClass('border-primary/45');
    expect(openAiButton).toHaveClass('bg-transparent');
    expect(openAiButton).not.toHaveClass('bg-primary');
    expect(openAiButton).not.toHaveClass('bg-primary/10');
    expect(openAiButton).not.toHaveClass('bg-muted/55');
    expect(openAiButton).not.toHaveClass('text-primary-foreground');

    const iconTile = within(openAiButton).getByTestId('model-picker-provider-icon-tile');
    expect(iconTile).toHaveAttribute('aria-hidden', 'true');
    expect(iconTile).toHaveClass('h-[18px]');
    expect(iconTile).toHaveClass('w-[18px]');
    expect(iconTile).toHaveClass('overflow-visible');
    expect(iconTile).not.toHaveClass('bg-muted/45');
    expect(iconTile).not.toHaveClass('bg-white');
    expect(iconTile).not.toHaveClass('border');
    expect(iconTile).not.toHaveClass('rounded-full');
    expect(iconTile).not.toHaveClass('shadow-sm');
    const iconImage = within(iconTile).getByAltText('openai');
    expect(iconImage.parentElement).toHaveClass('drop-shadow-[0_0_1px_rgba(15,23,42,0.45)]');
  });

  it('provider 分组按 useModelOptions.providers 顺序展示，不按名称二次排序', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    await screen.findByRole('option', { name: /GPT-5.4/i });
    const rows = Array.from(
      screen.getByTestId('model-picker-list').querySelectorAll<HTMLElement>('[data-model-picker-row]'),
    );
    const openAiGroupIndex = rows.findIndex((row) => row.textContent?.includes('OpenAI'));
    const anthropicGroupIndex = rows.findIndex((row) => row.textContent?.includes('Anthropic'));

    expect(openAiGroupIndex).toBeGreaterThanOrEqual(0);
    expect(anthropicGroupIndex).toBeGreaterThanOrEqual(0);
    expect(openAiGroupIndex).toBeLessThan(anthropicGroupIndex);
  });

  it('当前已选模型被筛选器排除时，仍会保底显示在列表中', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
          filter={(model) => model.providerId === 'anthropic'}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText('modelSelect.currentSelection')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /GPT-5.4/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('modelSelect.currentUnavailable')).toBeInTheDocument();
  });

  it('会保留图片生成模型选项，并在顶部模型类型筛选中暴露图片生成', async () => {
    render(
      <TooltipProvider>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByRole('option', { name: /GPT Image 1/i })).toBeInTheDocument();
    expect(screen.getByTestId('model-picker-type-text_generation')).toBeInTheDocument();
    expect(screen.getByTestId('model-picker-type-image_generation')).toBeInTheDocument();
    expect(screen.getByTestId('model-picker-type-vision')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Image Gen').length).toBeGreaterThanOrEqual(2);
  });

  it('顶部模型类型 icon hover 后会显示 tooltip，并挂在当前 dialog shell 内', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <ModelPickerDialog
          open
          value="openai/gpt-5.4"
          onSelect={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const imageGenerationTrigger = await screen.findByTestId('model-picker-type-image_generation');
    await user.hover(imageGenerationTrigger);

    const tooltip = await screen.findByRole('tooltip');
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(tooltip).toHaveTextContent(/Image (Gen|Generation)/);
    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(tooltip)).toBe(true);
  });

  it('列表行右侧模型类型 icon hover 后会显示 tooltip，点击仍会选择该模型', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TooltipProvider delayDuration={0}>
        <ModelPickerDialog
          open
          value="anthropic/claude-sonnet-4-6"
          onSelect={onSelect}
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const option = await screen.findByRole('option', { name: /GPT-5\.4/i });
    const row = option.closest('[data-model-id="openai/gpt-5.4"]');
    expect(row).not.toBeNull();

    const capabilities = within(row as HTMLElement).getByTestId('model-picker-row-capabilities');
    expect(capabilities).toHaveClass('pointer-events-auto');

    const visionTrigger = within(capabilities).getByLabelText('Vision');
    await user.hover(visionTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Vision');

    await user.click(visionTrigger);
    expect(onSelect).toHaveBeenCalledWith('openai/gpt-5.4');
  });
});
