/**
 * 说明：`CapabilityPill.spec` 组件模块。
 *
 * 职责：
 * - 承载 `CapabilityPill.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CapabilityPill } from './CapabilityPill';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from '@/components/ui/overlay-layers';
import { capabilityLabel } from '@/lib/ai/capability-label';
import { toPresentationToken } from '@/lib/ai/model-type-system';

describe('CapabilityPill', () => {
  it('会把新的模型类型系统展示键归一化成稳定的 UI token', () => {
    expect(toPresentationToken('text_generation')).toBe('chat');
    expect(toPresentationToken('image_generation')).toBe('image-generation');
    expect(toPresentationToken('function_calling')).toBe('tool-call');
    expect(toPresentationToken('web_search')).toBe('native-web-search');
    expect(toPresentationToken('structured_output')).toBe('structured-output');
    expect(toPresentationToken('image_output')).toBe('image-output');
    expect(toPresentationToken('audio_input')).toBe('audio-input');
    expect(toPresentationToken('audio_output')).toBe('audio-output');
    expect(toPresentationToken('audio_model')).toBe('audio-model');
    expect(toPresentationToken('file_input')).toBe('file-input');
  });

  it('新的展示键仍然会渲染正确文案与图标', () => {
        /**
     * 测试辅助函数：`t`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    const t = (key: string) => {
      const map: Record<string, string> = {
        'modelManagerPanel.modelDialog.modelTypes.text_generation': '文本生成',
        'modelManagerPanel.modelDialog.modelTypes.image_generation': '图片生成',
        'modelManagerPanel.modelDialog.modelTypes.vision': '视觉',
        'modelManagerPanel.modelDialog.modelTypes.rerank': '重排',
        'modelManagerPanel.modelDialog.modelTypes.web_search': '联网搜索',
        'modelRegistry.capabilities.tool-call': '工具调用',
        'modelRegistry.capabilities.native-web-search': '原生联网',
        'modelRegistry.capabilities.structured-output': '结构化输出',
        'modelRegistry.capabilities.image-output': '图像输出',
        'modelRegistry.capabilities.audio-input': '音频输入',
        'modelRegistry.capabilities.audio-output': '音频输出',
        'modelRegistry.capabilities.audio-model': '音频模型',
        'modelRegistry.capabilities.transcription': '语音转写',
        'modelRegistry.capabilities.moderation': '内容审核',
        'modelRegistry.capabilities.file-input': '文件输入',
      };
      return map[key] ?? key;
    };

    const { container } = render(
      <TooltipProvider>
        <div>
          <CapabilityPill capability="text_generation" label={capabilityLabel('text_generation', t)} active />
          <CapabilityPill capability="image_generation" label={capabilityLabel('image_generation', t)} active iconOnly />
          <CapabilityPill capability="vision" label={capabilityLabel('vision', t)} active />
          <CapabilityPill capability="rerank" label={capabilityLabel('rerank', t)} active iconOnly />
          <CapabilityPill capability="function_calling" label={capabilityLabel('function_calling', t)} active />
          <CapabilityPill capability="web_search" label={capabilityLabel('web_search', t)} active />
          <CapabilityPill capability="structured_output" label={capabilityLabel('structured_output', t)} active />
          <CapabilityPill capability="image_output" label={capabilityLabel('image_output', t)} active />
          <CapabilityPill capability="audio_input" label={capabilityLabel('audio_input', t)} active />
          <CapabilityPill capability="audio_output" label={capabilityLabel('audio_output', t)} active />
          <CapabilityPill capability="audio_model" label={capabilityLabel('audio_model', t)} active />
          <CapabilityPill capability="transcription" label={capabilityLabel('transcription', t)} active />
          <CapabilityPill capability="moderation" label={capabilityLabel('moderation', t)} active />
          <CapabilityPill capability="file_input" label={capabilityLabel('file_input', t)} active />
        </div>
      </TooltipProvider>,
    );

    expect(screen.getByText('文本生成')).toBeInTheDocument();
    expect(screen.getByLabelText('图片生成')).toBeInTheDocument();
    expect(screen.getByText('视觉')).toBeInTheDocument();
    expect(screen.getByLabelText('重排')).toBeInTheDocument();
    expect(screen.getByText('工具调用')).toBeInTheDocument();
    expect(screen.getByText('联网搜索')).toBeInTheDocument();
    expect(screen.getByText('结构化输出')).toBeInTheDocument();
    expect(screen.getByText('图像输出')).toBeInTheDocument();
    expect(screen.getByText('音频输入')).toBeInTheDocument();
    expect(screen.getByText('音频输出')).toBeInTheDocument();
    expect(screen.getByText('音频模型')).toBeInTheDocument();
    expect(screen.getByText('语音转写')).toBeInTheDocument();
    expect(screen.getByText('内容审核')).toBeInTheDocument();
    expect(screen.getByText('文件输入')).toBeInTheDocument();
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(14);
  });

  it('iconOnly 模式在 dialog 内仍会把 tooltip 挂回当前 modal shell', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>capability pill tooltip</DialogTitle>
            <CapabilityPill capability="image_generation" label="图片生成" active iconOnly />
          </DialogContent>
        </Dialog>
      </TooltipProvider>,
    );

    await user.hover(screen.getByLabelText('图片生成'));

    const tooltip = await screen.findByRole('tooltip');
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(tooltip).toHaveTextContent('图片生成');
    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(tooltip)).toBe(true);
  });
});
