/**
 * 说明：技术栈弹层技术项 logo 渲染测试。
 *
 * 职责：
 * - 验证弹层里的技术项只展示本地 compact catalog 命中的固定版本 jsDelivr 图标；
 * - 验证 catalog 的 light/dark 变体会按主题选择；
 * - 验证 catalog 未加载或远程 SVG 失败时回到本地文字占位，避免误导。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TechnologyStackPopover } from './TechnologyStackPopover';
import type { TechnologyStackResult } from '@/lib/technology-stack/types';
import type { TechnologyStackResultUpdatedPayload } from '@/lib/extension/technology-stack-api';
import {
  TECHNOLOGY_ICON_CATALOG_CDN_ROOT,
  type TechnologyIconCatalog,
} from '@/lib/technology-stack/icon-catalog-schema';

const requestTechnologyStack = vi.fn();
const refreshTechnologyStack = vi.fn();
const loadTechnologyIconCatalog = vi.fn();
const peekTechnologyIconCatalog = vi.fn();
const technologyStackUpdateListeners = new Set<(payload: TechnologyStackResultUpdatedPayload) => void>();

vi.mock('@/lib/extension/technology-stack-api', () => ({
  onTechnologyStackResultUpdated: (listener: (payload: TechnologyStackResultUpdatedPayload) => void) => {
    technologyStackUpdateListeners.add(listener);
    return () => technologyStackUpdateListeners.delete(listener);
  },
  requestTechnologyStack: (...args: unknown[]) => requestTechnologyStack(...args),
  refreshTechnologyStack: (...args: unknown[]) => refreshTechnologyStack(...args),
}));

vi.mock('@/lib/technology-stack/icon-catalog-client', () => ({
  loadTechnologyIconCatalog: (...args: unknown[]) => loadTechnologyIconCatalog(...args),
  peekTechnologyIconCatalog: (...args: unknown[]) => peekTechnologyIconCatalog(...args),
}));

/** 构造已校验本地 compact catalog fixture。 */
function createCatalog(): TechnologyIconCatalog {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-10T00:00:00.000Z',
    sourceRules: {
      path: 'public/data/technology-fingerprints/fingerprint-rules.json',
      snapshotVersion: '6.12.2',
      generatedAt: '2026-05-10T00:00:00.000Z',
      ruleCount: 7098,
      technologyCount: 7193,
      categoryCount: 106,
    },
    iconCount: 3,
    sources: {
      ts: 'gh/glincker/thesvg@v2.3.0/public/icons/',
      si: 'npm/simple-icons@16.18.1/icons/',
      di: 'npm/devicon@2.17.0/icons/',
      mit: 'npm/material-icon-theme@5.34.0/icons/',
      ski: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
      tb: 'npm/@tabler/icons@3.44.0/icons/outline/',
    },
    icons: {
      react: ['di', 'react/react-original.svg'],
      cloudflare: ['ts', 'cloudflare/default.svg'],
      'next-js': {
        light: ['ski', 'NextJS-Light.svg'],
        dark: ['ski', 'NextJS-Dark.svg'],
      },
    },
    generic: {
      default: ['tb', 'code.svg'],
      'javascript-frameworks': ['tb', 'code.svg'],
      'payment-processors': ['tb', 'credit-card.svg'],
      'ui-framework': ['tb', 'brush.svg'],
      'web-server': ['tb', 'server.svg'],
    },
  };
}

const iconCatalog = createCatalog();

let currentIconCatalog: TechnologyIconCatalog | null = iconCatalog;

/** 测试翻译函数。 */
const t = ((key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'pageContext.technologyStack.category.javascript-frameworks': 'JavaScript 框架',
    'pageContext.technologyStack.category.javascript-libraries': 'JavaScript 库',
    'pageContext.technologyStack.category.payment-processors': '支付处理器',
    'pageContext.technologyStack.category.ui-frameworks': 'UI 框架',
    'pageContext.technologyStack.category.web-frameworks': 'Web 框架',
    'pageContext.technologyStack.errorReason.content-script-unreachable': '当前网页的 Olyq 页面脚本没有响应，请刷新网页后重试。',
    'pageContext.technologyStack.errorReason.technology-stack-unavailable': '检测链路暂时不可用，请刷新网页后重试。',
  };
  if (translations[key]) return translations[key];
  if (key === 'pageContext.technologyStack.status.ready') return `${options?.count ?? 0} found`;
  if (key === 'pageContext.technologyStack.confidence') return `置信度 ${options?.count ?? 0}%`;
  if (key === 'pageContext.technologyStack.error') return `技术栈检测失败：${options?.reason ?? ''}`;
  return key;
}) as never;

/** 技术栈探测结果 fixture。 */
const result: TechnologyStackResult = {
  status: 'ready',
  tabId: 1,
  url: 'https://example.com/',
  title: 'Example',
  pageFingerprint: 'fingerprint',
  detectedAt: 1,
  scanCoverage: 'complete',
  technologies: [{
    name: 'React',
    slug: 'react',
    categories: ['ui-framework'],
    confidence: 95,
    sources: ['script-src'],
    evidence: [],
    iconCandidates: [],
    iconFallback: 'U',
  }],
};

const pageKey = '1::https://example.com/::0';
const reloadedPageKey = '1::https://example.com/::1';

/** 向弹层模拟 SW 易失技术栈更新事件。 */
function emitTechnologyStackUpdate(update: TechnologyStackResult, updatePageKey = pageKey): void {
  for (const listener of technologyStackUpdateListeners) {
    listener({ pageKey: updatePageKey, enhanced: true, result: update });
  }
}

/** 渲染一个绑定到 example.com 的技术栈弹层。 */
function renderTechnologyStackPopover(): void {
  render(
    <TechnologyStackPopover
      metadata={{
        tabId: 1,
        url: 'https://example.com/',
        title: 'Example',
        favicon: '',
        extractedAt: 1,
        technologyStackPageKey: pageKey,
      }}
      enabled
      actionChipClassName="inline-flex"
      t={t}
    />,
  );
}

describe('TechnologyStackPopover technology icons', () => {
  beforeEach(() => {
    requestTechnologyStack.mockReset();
    refreshTechnologyStack.mockReset();
    loadTechnologyIconCatalog.mockReset();
    peekTechnologyIconCatalog.mockReset();
    currentIconCatalog = iconCatalog;
    loadTechnologyIconCatalog.mockImplementation(async () => currentIconCatalog);
    peekTechnologyIconCatalog.mockImplementation(() => currentIconCatalog);
    technologyStackUpdateListeners.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('首次打开时在完整结果返回前显示检测中', async () => {
    requestTechnologyStack.mockReturnValue(new Promise(() => {}));

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    expect(await screen.findByText('pageContext.technologyStack.detecting')).toBeInTheDocument();
    expect(screen.queryByText('pageContext.technologyStack.empty')).not.toBeInTheDocument();
    expect(requestTechnologyStack).toHaveBeenCalledTimes(1);
    expect(requestTechnologyStack).toHaveBeenCalledWith({ tabId: 1 });
  });

  it('内容脚本不可达时展示用户可读失败原因，不透出内部错误码', async () => {
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        status: 'error',
        technologies: [],
        error: 'content-script-unreachable',
      },
    });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));

    expect(await screen.findByText('技术栈检测失败：当前网页的 Olyq 页面脚本没有响应，请刷新网页后重试。')).toBeInTheDocument();
    expect(screen.queryByText(/content-script-unreachable/)).not.toBeInTheDocument();
  });

  it('未知技术栈请求失败走通用文案，不透出原始异常', async () => {
    requestTechnologyStack.mockResolvedValue({
      ok: false,
      error: 'raw mystery transport failure',
    });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));

    expect(await screen.findByText('技术栈检测失败：检测链路暂时不可用，请刷新网页后重试。')).toBeInTheDocument();
    expect(screen.queryByText(/raw mystery transport failure/)).not.toBeInTheDocument();
  });

  it('自动预热结果到达后，打开弹层直接复用在线更新', async () => {
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    act(() => {
      emitTechnologyStackUpdate(result);
    });

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    expect(requestTechnologyStack).not.toHaveBeenCalled();
  });

  it('弹层总数只在状态行展示，标题行不重复展示裸数字', async () => {
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    expect(screen.getByText('1 found')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'pageContext.technologyStack.title' });
    expect(heading.parentElement).not.toHaveTextContent('1');
  });

  it('手动刷新继续走 force 请求并更新结果', async () => {
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });
    refreshTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        technologies: [{
          ...result.technologies[0],
          name: 'Vue.js',
          slug: 'vue-js',
        }],
      },
    });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    fireEvent.click(screen.getByRole('button', { name: 'pageContext.technologyStack.refresh' }));

    await screen.findByText('Vue.js');
    expect(refreshTechnologyStack).toHaveBeenCalledTimes(1);
    expect(refreshTechnologyStack).toHaveBeenCalledWith({ tabId: 1 });
  });

  it('后台增强完成后用 runtime update 刷新当前页面结果', async () => {
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    act(() => {
      emitTechnologyStackUpdate({
        ...result,
        detectedAt: result.detectedAt + 1,
        technologies: [{
          ...result.technologies[0],
          name: 'Next.js',
          slug: 'next-js',
        }],
      });
    });

    await screen.findByText('Next.js');
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('metadata 时间晚于探测时间时，匹配 pageKey 的 runtime update 仍会刷新当前页面', async () => {
    requestTechnologyStack.mockReturnValue(new Promise(() => {}));

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 100,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('pageContext.technologyStack.detecting');

    act(() => {
      emitTechnologyStackUpdate({ ...result, detectedAt: 11 });
    });

    await screen.findByText('React');
  });

  it('同 URL reload 后 pageKey 变化会清掉旧结果', async () => {
    requestTechnologyStack.mockResolvedValueOnce({ ok: true, payload: result });
    requestTechnologyStack.mockReturnValueOnce(new Promise(() => {}));

    const { rerender } = render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    rerender(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example Reloaded',
          favicon: '',
          extractedAt: 2,
          technologyStackPageKey: reloadedPageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    await screen.findByText('pageContext.technologyStack.detecting');
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('同 URL reload 后旧 pageKey 的 runtime update 不会把旧页面结果重新展示出来', async () => {
    requestTechnologyStack.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 10,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    act(() => {
      emitTechnologyStackUpdate({ ...result, detectedAt: 11 });
    });
    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    rerender(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example Reloaded',
          favicon: '',
          extractedAt: 20,
          technologyStackPageKey: reloadedPageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    act(() => {
      emitTechnologyStackUpdate({ ...result, detectedAt: 11 }, pageKey);
    });

    expect(await screen.findByText('pageContext.technologyStack.detecting')).toBeInTheDocument();
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('同 URL reload 后新 pageKey 结果不受旧页面 detectedAt 单调保护影响', async () => {
    requestTechnologyStack.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 10,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    act(() => {
      emitTechnologyStackUpdate({ ...result, detectedAt: 50 });
    });
    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    rerender(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example Reloaded',
          favicon: '',
          extractedAt: 60,
          technologyStackPageKey: reloadedPageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    act(() => {
      emitTechnologyStackUpdate({
        ...result,
        detectedAt: 20,
        technologies: [{
          ...result.technologies[0],
          name: 'Next.js',
          slug: 'next-js',
        }],
      }, reloadedPageKey);
    });

    await screen.findByText('Next.js');
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('分类 header 和次级分类 chip 使用 slug 国际化，不展示快照英文名', async () => {
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        technologies: [{
          ...result.technologies[0],
          name: 'Next.js',
          slug: 'next-js',
          categories: ['javascript-frameworks', 'web-frameworks'],
          categoryInfos: [
            { id: 12, name: 'JavaScript frameworks', slug: 'javascript-frameworks', priority: 8 },
            { id: 18, name: 'Web frameworks', slug: 'web-frameworks', priority: 7 },
          ],
        }],
      },
    });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('JavaScript 框架');

    expect(screen.getByText('JavaScript 框架')).toBeInTheDocument();
    expect(screen.getAllByText('Web 框架').length).toBeGreaterThan(0);
    expect(screen.queryByText('JavaScript frameworks')).not.toBeInTheDocument();
    expect(screen.queryByText('Web frameworks')).not.toBeInTheDocument();
  });

  it('技术项 logo 只加载本地 compact catalog 展开的固定版本 URL，失败后回到本地占位', async () => {
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    expect(screen.getByTestId('technology-stack-trigger-icon')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');
    expect(screen.getByTestId('technology-stack-header-icon')).toBeInTheDocument();
    expect(screen.getByText('置信度 95%')).toBeInTheDocument();

    const icon = await screen.findByTestId('technology-stack-tech-icon-img');
    expect(icon).toHaveAttribute('src', `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/devicon@2.17.0/icons/react/react-original.svg`);
    expect(icon.parentElement).toHaveClass('bg-white', 'dark:bg-zinc-50', 'text-zinc-950');
    expect(icon.parentElement).not.toHaveClass('dark:bg-zinc-950', 'dark:text-white', 'dark:invert');
    expect(loadTechnologyIconCatalog).toHaveBeenCalled();

    fireEvent.error(icon);
    await waitFor(() => {
      expect(screen.getByTestId('technology-stack-tech-icon-fallback')).toHaveTextContent('U');
    });
  });

  it('skill-icons 成对变体按扩展深色主题选择', async () => {
    document.documentElement.classList.add('dark');
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        technologies: [{
          ...result.technologies[0],
          name: 'Next.js',
          slug: 'next-js',
          categories: ['javascript-frameworks'],
          iconFallback: 'J',
        }],
      },
    });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('Next.js');

    expect(await screen.findByTestId('technology-stack-tech-icon-img'))
      .toHaveAttribute('src', `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/NextJS-Dark.svg`);
  });

  it('品牌未入 catalog 的技术项使用 generic 分类图标', async () => {
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        technologies: [{
          ...result.technologies[0],
          name: 'Private Tech',
          slug: 'missing-private-tech',
          categories: ['web-server'],
          iconFallback: 'S',
        }],
      },
    });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('Private Tech');

    expect(screen.getByTestId('technology-stack-tech-icon-img'))
      .toHaveAttribute('src', `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/@tabler/icons@3.44.0/icons/outline/server.svg`);
    expect(screen.queryByTestId('technology-stack-tech-icon-fallback')).not.toBeInTheDocument();
  });

  it('打开弹层不会 fetch 远程图标 catalog，图标清单只通过本地 catalog client 预热', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loadTechnologyIconCatalog).toHaveBeenCalled();
  });

  it('清单未加载时先展示本地占位，加载后重新渲染 catalog 图标', async () => {
    currentIconCatalog = null;
    /** 完成异步 catalog 加载的测试 resolver。 */
    let resolveCatalog: (catalog: TechnologyIconCatalog) => void = () => undefined;
    loadTechnologyIconCatalog.mockImplementation(() => new Promise<TechnologyIconCatalog>((resolve) => {
      resolveCatalog = resolve;
    }));
    peekTechnologyIconCatalog.mockReturnValue(null);
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: result });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');
    expect(screen.getByTestId('technology-stack-tech-icon-fallback')).toHaveTextContent('U');
    expect(screen.queryByTestId('technology-stack-tech-icon-img')).not.toBeInTheDocument();

    await act(async () => {
      currentIconCatalog = iconCatalog;
      resolveCatalog(iconCatalog);
    });

    expect(await screen.findByTestId('technology-stack-tech-icon-img'))
      .toHaveAttribute('src', `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}npm/devicon@2.17.0/icons/react/react-original.svg`);
  });

  it('本地 catalog 加载失败时展示本地文字占位', async () => {
    currentIconCatalog = null;
    loadTechnologyIconCatalog.mockResolvedValue(null);
    peekTechnologyIconCatalog.mockReturnValue(null);
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        technologies: [{
          ...result.technologies[0],
          name: 'Private Tech',
          slug: 'missing-private-tech',
          categories: ['web-server'],
          iconFallback: 'S',
        }],
      },
    });

    renderTechnologyStackPopover();

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('Private Tech');

    expect(screen.queryByTestId('technology-stack-tech-icon-img')).not.toBeInTheDocument();
    expect(screen.getByTestId('technology-stack-tech-icon-fallback')).toHaveTextContent('S');
  });

  it('技术项列表使用单一滚动 body，分类头不再 sticky 且长列表保留最后一项', async () => {
    const layoutResult: TechnologyStackResult = {
      ...result,
      technologies: [
        {
          ...result.technologies[0],
          name: 'Next.js',
          slug: 'nextjs',
          categories: ['framework'],
          website: 'https://nextjs.org/',
        },
        {
          ...result.technologies[0],
          name: 'React',
          slug: 'react',
          categories: ['ui-framework'],
          website: 'https://react.dev/',
        },
        {
          ...result.technologies[0],
          name: 'Shopify',
          slug: 'shopify',
          categories: ['ecommerce'],
          sources: ['html', 'script-src'],
        },
        {
          ...result.technologies[0],
          name: 'Cloudflare',
          slug: 'cloudflare',
          categories: ['cdn'],
          sources: ['headers'],
        },
      ],
    };
    requestTechnologyStack.mockResolvedValue({ ok: true, payload: layoutResult });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('Cloudflare');

    const popover = screen.getByTestId('technology-stack-popover');
    const viewports = popover.querySelectorAll('[data-slot="scroll-area-viewport"]');
    expect(viewports).toHaveLength(1);
    expect(viewports[0].className).toContain('max-h-[min(27rem,58vh)]');
    expect(viewports[0].className).toContain('overflow-y-auto');

    const categoryHeaders = screen.getAllByTestId('technology-stack-category-header');
    expect(categoryHeaders.length).toBeGreaterThan(1);
    categoryHeaders.forEach((header) => {
      expect(header.className).not.toContain('sticky');
      expect(header.className).not.toContain('top-0');
    });

    expect(screen.getByText('Next.js')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare')).toBeInTheDocument();
    const listContent = screen.getByTestId('technology-stack-list-content');
    const bottomSpacer = screen.getByTestId('technology-stack-list-bottom-spacer');
    expect(bottomSpacer).toHaveClass('h-4');
    expect(bottomSpacer).toHaveAttribute('aria-hidden', 'true');
    expect(listContent.lastElementChild).toBe(bottomSpacer);
    expect(screen.getAllByRole('link', { name: 'pageContext.technologyStack.openWebsite' }).length).toBeGreaterThan(0);
  });

  it('弹层不展示部分信号或规则包快照 chip', async () => {
    requestTechnologyStack.mockResolvedValue({
      ok: true,
      payload: {
        ...result,
        scanCoverage: 'complete',
        rulePackage: {
          total: 7098,
          technologyCount: 7193,
          categoryCount: 108,
          snapshotVersion: '6.12.2',
          source: 'local-fingerprint-snapshot',
          unsupportedSignals: ['dns', 'probe', 'certIssuer', 'robots'],
          updateChannel: 'extension-release',
        },
      },
    });

    render(
      <TechnologyStackPopover
        metadata={{
          tabId: 1,
          url: 'https://example.com/',
          title: 'Example',
          favicon: '',
          extractedAt: 1,
          technologyStackPageKey: pageKey,
        }}
        enabled
        actionChipClassName="inline-flex"
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('technology-stack-trigger'));
    await screen.findByText('React');

    expect(screen.queryByText('Partial signals')).not.toBeInTheDocument();
    expect(screen.queryByText('部分信号')).not.toBeInTheDocument();
    expect(screen.queryByText(/snapshot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/快照/)).not.toBeInTheDocument();
  });
});
