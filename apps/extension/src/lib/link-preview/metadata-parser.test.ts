/**
 * 说明：`metadata-parser.test` 链接预览解析测试。
 *
 * 职责：
 * - 锁定 Open Graph、Twitter 与基础 HTML 元数据的解析优先级；
 * - 覆盖相对图片 URL、重复 meta、空字段裁剪和非 http 图片过滤；
 *
 * 边界：
 * - 本文件只测试纯解析逻辑，不发起网络请求。
 */
import { describe, expect, it } from 'vitest';

import { hasMeaningfulLinkPreviewMetadata, parseLinkPreviewMetadata } from './metadata-parser';

describe('link-preview metadata parser', () => {
  it('优先解析 Open Graph 字段并解析相对 og:image', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      fetchedAt: 100,
      html: `
        <html>
          <head>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
            <meta property="og:image" content="/cover.png">
            <meta property="og:image:alt" content="Cover Alt">
            <meta property="og:site_name" content="Example Site">
            <title>HTML Title</title>
          </head>
        </html>
      `,
    });

    expect(metadata).toEqual({
      url: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      hostname: 'example.com',
      title: 'OG Title',
      description: 'OG Description',
      imageUrl: 'https://example.com/cover.png',
      imageAlt: 'Cover Alt',
      siteName: 'Example Site',
      fetchedAt: 100,
    });
    expect(hasMeaningfulLinkPreviewMetadata(metadata)).toBe(true);
  });

  it('缺少 Open Graph 时使用 Twitter 与基础 HTML fallback', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 200,
      html: `
        <head>
          <meta name="twitter:title" content="Twitter Title">
          <meta name="twitter:description" content="Twitter Description">
          <meta name="twitter:image" content="https://cdn.example.com/card.jpg">
          <meta name="twitter:image:alt" content="Twitter Image">
          <meta name="application-name" content="Example App">
          <meta name="description" content="HTML Description">
          <title>HTML Title</title>
        </head>
      `,
    });

    expect(metadata.title).toBe('Twitter Title');
    expect(metadata.description).toBe('Twitter Description');
    expect(metadata.imageUrl).toBe('https://cdn.example.com/card.jpg');
    expect(metadata.imageAlt).toBe('Twitter Image');
    expect(metadata.siteName).toBe('Example App');
  });

  it('重复 meta 保留首个值并解码 HTML 实体', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 300,
      html: `
        <head>
          <meta property="og:title" content="A &amp; B">
          <meta property="og:title" content="Second Title">
          <meta property="og:description" content="Line&#10;break&nbsp;text">
        </head>
      `,
    });

    expect(metadata.title).toBe('A & B');
    expect(metadata.description).toBe('Line break text');
  });

  it('空字段会被忽略，并裁剪超长文本', () => {
    const longTitle = '标题'.repeat(120);
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 400,
      html: `
        <head>
          <meta property="og:title" content="   ">
          <title>${longTitle}</title>
        </head>
      `,
    });

    expect(metadata.title?.length).toBeLessThanOrEqual(179);
    expect(metadata.description).toBeNull();
  });

  it('HTML title fallback 会用线性文本提取去掉嵌套标签并解码实体', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 450,
      html: `
        <head>
          <title>Hello <span>Tagged &amp; Safe</span> Title</title>
        </head>
      `,
    });

    expect(metadata.title).toBe('Hello Tagged & Safe Title');
  });

  it('非 http/https 图片地址会被丢弃', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 500,
      html: `
        <head>
          <meta property="og:title" content="Title">
          <meta property="og:image" content="data:image/png;base64,AAAA">
        </head>
      `,
    });

    expect(metadata.imageUrl).toBeNull();
    expect(metadata.title).toBe('Title');
  });

  it('指向本机或内网的预览图地址会被丢弃', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 550,
      html: `
        <head>
          <meta property="og:title" content="Title">
          <meta property="og:image" content="http://127.0.0.1/private.png">
        </head>
      `,
    });

    expect(metadata.imageUrl).toBeNull();
    expect(metadata.title).toBe('Title');
  });

  it('相对预览图地址仍会按已校验页面 URL 解析', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/articles/post',
      fetchedAt: 560,
      html: `
        <head>
          <meta property="og:title" content="Title">
          <meta property="og:image" content="../cover.png">
        </head>
      `,
    });

    expect(metadata.imageUrl).toBe('https://example.com/cover.png');
  });

  it('没有可用元数据时标记为无有效预览信息', () => {
    const metadata = parseLinkPreviewMetadata({
      requestedUrl: 'https://example.com/post',
      finalUrl: 'https://example.com/post',
      fetchedAt: 600,
      html: '<html><body>No head metadata</body></html>',
    });

    expect(hasMeaningfulLinkPreviewMetadata(metadata)).toBe(false);
    expect(metadata.hostname).toBe('example.com');
  });
});
