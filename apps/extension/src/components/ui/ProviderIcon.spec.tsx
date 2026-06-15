/**
 * 说明：`ProviderIcon.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ProviderIcon.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProviderIcon } from './ProviderIcon';
import { buildLobeIconUrl } from '@/lib/ai/provider-icons';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => 'light',
}));

describe('ProviderIcon', () => {
  it('prefers custom logo, then builtin icon, then fallback letter', async () => {
    render(
      <ProviderIcon
        providerId="aws-bedrock"
        customLogo="data:image/svg+xml;base64,PHN2Zy8+"
        fallbackIcon="A"
        fallbackColor="bg-zinc-600"
      />,
    );

    expect(screen.getByAltText('aws-bedrock').getAttribute('src')).toBe('data:image/svg+xml;base64,PHN2Zy8+');
    expect(screen.getByAltText('aws-bedrock').parentElement).toHaveAttribute('data-provider-icon-id', 'aws-bedrock');
    expect(screen.getByAltText('aws-bedrock').parentElement).toHaveAttribute('data-provider-icon-state', 'loading');

    fireEvent.load(screen.getByAltText('aws-bedrock'));

    await waitFor(() => {
      expect(screen.getByAltText('aws-bedrock').parentElement).toHaveAttribute('data-provider-icon-state', 'ok');
    });

    fireEvent.error(screen.getByAltText('aws-bedrock'));

    await waitFor(() => {
      expect(screen.getByAltText('aws-bedrock').getAttribute('src')).toBe(buildLobeIconUrl('bedrock', false, true));
    });

    fireEvent.error(screen.getByAltText('aws-bedrock'));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('A')).toHaveAttribute('data-provider-icon-id', 'aws-bedrock');
      expect(screen.getByText('A')).toHaveAttribute('data-provider-icon-state', 'fallback');
    });
  });

  it('falls back to the placeholder letter when no image source is available', () => {
    render(<ProviderIcon providerId="custom-provider" fallbackIcon="C" fallbackColor="bg-zinc-600" />);

    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
