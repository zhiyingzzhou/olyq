/**
 * 说明：`DefaultModelPanel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `DefaultModelPanel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultModelPanel } from './DefaultModelPanel';

const MOCK_MODELS = [
  {
    id: 'openai/gpt-5.4',
    modelId: 'gpt-5.4',
    name: 'GPT-5.4',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'chat',
    features: [],
  },
  {
    id: 'openai/gpt-5.4-vision',
    modelId: 'gpt-5.4-vision',
    name: 'GPT-5.4 Vision',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'multimodal-chat',
    features: ['vision-input'],
  },
  {
    id: 'openai/gpt-image-1',
    modelId: 'gpt-image-1',
    name: 'GPT Image 1',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'image-generation',
    features: ['image-output'],
  },
  {
    id: 'together/openai-whisper-large-v3',
    modelId: 'openai-whisper-large-v3',
    name: 'Whisper Large V3',
    providerId: 'together',
    providerName: 'Together',
    providerType: 'openai',
    kind: 'transcription',
    features: ['transcription'],
  },
  {
    id: 'openai/tts-1-hd',
    modelId: 'tts-1-hd',
    name: 'TTS 1 HD',
    providerId: 'openai',
    providerName: 'OpenAI',
    providerType: 'openai',
    kind: 'speech-generation',
    features: ['audio-output'],
  },
] as const;

type MockModel = (typeof MOCK_MODELS)[number];
type MockModelPickerProps = {
  open: boolean;
  value: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  filter: (model: MockModel) => boolean;
};

type MockSettings = {
  defaultModel: string;
  defaultImageModel: string;
  defaultTranscriptionModel?: string;
  defaultSpeechModel?: string;
  defaultSpeechVoice?: string;
  defaultTemperature: number;
  defaultTopP: number;
  defaultMaxTokens: number;
  defaultContextLength: number;
  defaultSystemPrompt: string;
  defaultImagePromptPrefix: string;
  topicNamingModel?: string;
  translateModel?: string;
  ocrModel?: string;
};

const mockState = vi.hoisted(() => ({
  settings: {
    defaultModel: 'openai/gpt-5.4',
    defaultImageModel: 'openai/gpt-image-1',
    defaultTranscriptionModel: 'together/openai-whisper-large-v3',
    defaultSpeechModel: 'openai/tts-1-hd',
    defaultSpeechVoice: 'alloy',
    defaultTemperature: 0.7,
    defaultTopP: 1,
    defaultMaxTokens: 4096,
    defaultContextLength: 10,
    defaultSystemPrompt: 'global chat prompt',
    defaultImagePromptPrefix: 'global image prompt',
    topicNamingModel: 'openai/gpt-5.4',
    translateModel: 'openai/gpt-5.4',
    ocrModel: undefined,
  } as MockSettings,
  setSettings: vi.fn(),
  lastModelPickerProps: null as MockModelPickerProps | null,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: (selector: (state: { settings: MockSettings; setSettings: typeof mockState.setSettings }) => unknown) =>
    selector({
      settings: mockState.settings,
      setSettings: mockState.setSettings,
    }),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined, enabled: true },
      { id: 'together', name: 'Together', logo: undefined, enabled: true },
    ],
    getModelLabel: (id: string) => MOCK_MODELS.find((model) => model.id === id)?.name ?? id,
  }),
}));

vi.mock('@/lib/ai/provider-capabilities', () => ({
  supportsImageProvider: () => true,
  supportsSpeechProvider: () => true,
  supportsTranscriptionProvider: () => true,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: (props: MockModelPickerProps) => {
    mockState.lastModelPickerProps = props;
    return props.open ? <div data-testid="default-model-panel-picker" /> : null;
  },
}));

describe('DefaultModelPanel', () => {
  const SLOT_ID_BY_TITLE: Record<string, string> = {
    'defaultModelPanel.conversationModel': 'default',
    'defaultModelPanel.imageModel': 'image',
    'defaultModelPanel.transcriptionModel': 'transcription',
    'defaultModelPanel.speechModel': 'speech',
    'defaultModelPanel.ocrModel': 'ocr',
    'defaultModelPanel.topicNamingModel': 'topic',
    'defaultModelPanel.translateModel': 'translate',
  };

    /**
   * 测试辅助函数：`clickSlotTrigger`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  const clickSlotTrigger = (title: string) => {
    const slotId = SLOT_ID_BY_TITLE[title];
    if (!slotId) throw new Error(`未配置 ${title} 对应的 slotId`);
    fireEvent.click(screen.getByTestId(`default-model-panel-select-${slotId}`));
  };

  beforeEach(() => {
    mockState.settings = {
      defaultModel: 'openai/gpt-5.4',
      defaultImageModel: 'openai/gpt-image-1',
      defaultTranscriptionModel: 'together/openai-whisper-large-v3',
      defaultSpeechModel: 'openai/tts-1-hd',
      defaultSpeechVoice: 'alloy',
      defaultTemperature: 0.7,
      defaultTopP: 1,
      defaultMaxTokens: 4096,
      defaultContextLength: 10,
      defaultSystemPrompt: 'global chat prompt',
      defaultImagePromptPrefix: 'global image prompt',
      topicNamingModel: 'openai/gpt-5.4',
      translateModel: 'openai/gpt-5.4',
      ocrModel: undefined,
    };
    mockState.setSettings.mockReset();
    mockState.lastModelPickerProps = null;
  });

  it.each([
    {
      title: 'defaultModelPanel.conversationModel',
      expectedValue: 'openai/gpt-5.4',
      expectedChat: true,
      expectedImage: false,
      expectedTranscription: false,
      expectedOcr: true,
    },
    {
      title: 'defaultModelPanel.imageModel',
      expectedValue: 'openai/gpt-image-1',
      expectedChat: false,
      expectedImage: true,
      expectedTranscription: false,
      expectedOcr: false,
    },
    {
      title: 'defaultModelPanel.transcriptionModel',
      expectedValue: 'together/openai-whisper-large-v3',
      expectedChat: false,
      expectedImage: false,
      expectedTranscription: true,
      expectedOcr: false,
    },
    {
      title: 'defaultModelPanel.speechModel',
      expectedValue: 'openai/tts-1-hd',
      expectedChat: false,
      expectedImage: false,
      expectedTranscription: false,
      expectedOcr: false,
    },
    {
      title: 'defaultModelPanel.topicNamingModel',
      expectedValue: 'openai/gpt-5.4',
      expectedChat: true,
      expectedImage: false,
      expectedTranscription: false,
      expectedOcr: true,
    },
    {
      title: 'defaultModelPanel.translateModel',
      expectedValue: 'openai/gpt-5.4',
      expectedChat: true,
      expectedImage: false,
      expectedTranscription: false,
      expectedOcr: true,
    },
  ])('会为 $title 接入正确的模型筛选语义', async ({ title, expectedValue, expectedChat, expectedImage, expectedTranscription, expectedOcr }) => {
    render(<DefaultModelPanel />);

    clickSlotTrigger(title);

    await waitFor(() => {
      expect(screen.getByTestId('default-model-panel-picker')).toBeInTheDocument();
    });

    expect(mockState.lastModelPickerProps).not.toBeNull();
    const pickerProps = mockState.lastModelPickerProps as MockModelPickerProps;
    expect(pickerProps.open).toBe(true);
    expect(pickerProps.value).toBe(expectedValue);
    expect(pickerProps.filter(MOCK_MODELS[0])).toBe(expectedChat);
    expect(pickerProps.filter(MOCK_MODELS[1])).toBe(expectedOcr);
    expect(pickerProps.filter(MOCK_MODELS[2])).toBe(expectedImage);
    expect(pickerProps.filter(MOCK_MODELS[3])).toBe(expectedTranscription);
    if (title === 'defaultModelPanel.speechModel') {
      expect(pickerProps.filter(MOCK_MODELS[4])).toBe(true);
      expect(pickerProps.filter(MOCK_MODELS[3])).toBe(false);
      return;
    }
    expect(pickerProps.filter(MOCK_MODELS[4])).toBe(false);
  });

  it('OCR 模型选择器只允许视觉对话模型，并可显式覆盖默认模型', async () => {
    mockState.settings = {
      ...mockState.settings,
      ocrModel: 'openai/gpt-5.4-vision',
    };
    render(<DefaultModelPanel />);

    clickSlotTrigger('defaultModelPanel.ocrModel');

    await waitFor(() => {
      expect(screen.getByTestId('default-model-panel-picker')).toBeInTheDocument();
    });

    const pickerProps = mockState.lastModelPickerProps as MockModelPickerProps;
    expect(pickerProps.value).toBe('openai/gpt-5.4-vision');
    expect(pickerProps.filter(MOCK_MODELS[0])).toBe(false);
    expect(pickerProps.filter(MOCK_MODELS[1])).toBe(true);
    expect(pickerProps.filter(MOCK_MODELS[2])).toBe(false);
    expect(pickerProps.filter(MOCK_MODELS[3])).toBe(false);
    expect(pickerProps.filter(MOCK_MODELS[4])).toBe(false);

    act(() => pickerProps.onSelect('openai/gpt-5.4-vision'));
    expect(mockState.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      ocrModel: 'openai/gpt-5.4-vision',
    }));
  });

  it('会把两个全局提示词输入写回 ChatSettings', () => {
    render(<DefaultModelPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'defaultModelPanel.globalChatPrompt' }), {
      target: { value: 'new global chat prompt' },
    });
    expect(mockState.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      defaultSystemPrompt: 'new global chat prompt',
    }));

    fireEvent.change(screen.getByRole('textbox', { name: 'defaultModelPanel.globalImagePrompt' }), {
      target: { value: 'new global image prompt' },
    });
    expect(mockState.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      defaultImagePromptPrefix: 'new global image prompt',
    }));
  });

  it('会把默认语音 voice 输入写回 ChatSettings', () => {
    render(<DefaultModelPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'defaultModelPanel.speechVoice' }), {
      target: { value: 'nova' },
    });

    expect(mockState.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      defaultSpeechVoice: 'nova',
    }));
  });

  it('会给面板里的文本输入与模型选择器应用内收焦点描边，避免描边被设置弹窗裁切', () => {
    render(<DefaultModelPanel />);

    const defaultModelTrigger = screen.getByTestId('default-model-panel-select-default');
    expect(defaultModelTrigger).toHaveClass(
      'focus-visible:border-ring',
      'focus-visible:ring-1',
      'focus-visible:ring-inset',
      'focus-visible:ring-offset-0',
    );
    expect(defaultModelTrigger).toHaveClass('h-8', 'rounded-md', 'border-input');
    expect(defaultModelTrigger).not.toHaveClass('rounded-lg');

    for (const label of [
      'defaultModelPanel.globalChatPrompt',
      'defaultModelPanel.globalImagePrompt',
      'defaultModelPanel.speechVoice',
    ]) {
      const field = screen.getByRole('textbox', { name: label });
      expect(field).toHaveClass(
        'focus-visible:border-ring',
        'focus-visible:ring-1',
        'focus-visible:ring-inset',
        'focus-visible:ring-offset-0',
      );
      expect(field).not.toHaveClass('focus-visible:ring-offset-2');
    }
  });

  it.each([
    { slotId: 'topic', key: 'topicNamingModel' },
    { slotId: 'translate', key: 'translateModel' },
    { slotId: 'ocr', key: 'ocrModel' },
  ])('当继承默认模型开启时会禁用 $slotId 的选择器', ({ slotId, key }) => {
    mockState.settings = {
      ...mockState.settings,
      [key]: undefined,
    };

    render(<DefaultModelPanel />);

    const trigger = screen.getByTestId(`default-model-panel-select-${slotId}`);
    expect(trigger).toBeDisabled();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('default-model-panel-picker')).not.toBeInTheDocument();
  });
});
