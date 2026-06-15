/**
 * 说明：Service Worker runtime router guard。
 *
 * 职责：
 * - 防止 `service-worker.ts` 重新出现裸字符串 handler 索引分发；
 * - 确认 one-shot 与 Port handler map 都通过协议联合类型收窄；
 * - 防止 Port 协议重新从 `sw-messages.ts` 旧总入口转发。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 读取 src 下文件内容。 */
function readSrcFile(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('runtime message router guard', () => {
  it('keeps service-worker dispatch behind typed routers', () => {
    const serviceWorkerText = readSrcFile('extension/background/service-worker.ts');

    expect(serviceWorkerText).toContain('createServiceWorkerPortRouter');
    expect(serviceWorkerText).toContain('createServiceWorkerOneShotRouter');
    expect(serviceWorkerText).toContain('portRouter.dispatch');
    expect(serviceWorkerText).toContain('oneShotRouter.dispatch');
    expect(serviceWorkerText).not.toMatch(/handlerMap\s*\[\s*[^\\\]]*\.type\s*\]/);
    expect(serviceWorkerText).not.toMatch(/oneShotMap\s*\[\s*[^\\\]]*type[^\\\]]*\]/);
  });

  it('keeps handler maps keyed by current protocol unions', () => {
    const barrelText = readSrcFile('extension/background/message-handlers.ts');
    const typesText = readSrcFile('extension/background/message-handlers/types.ts');

    expect(barrelText).toContain('PortMessageHandlerMap');
    expect(barrelText).toContain('OneShotHandlerMap');
    expect(barrelText).not.toContain('Record<string, MessageHandler>');
    expect(barrelText).not.toContain('Record<string, OneShotHandler>');
    expect(typesText).toContain("Partial<Record<UiPortOutboundMessage['type'], MessageHandler>>");
    expect(typesText).toContain("Partial<Record<SwInboundMessage['type'], OneShotHandler>>");
  });

  it('keeps one-shot and Port message modules separated', () => {
    const swMessagesText = readSrcFile('types/sw-messages.ts');
    const swPortMessagesText = readSrcFile('types/sw-port-messages.ts');
    const contentScriptMessagesText = readSrcFile('types/content-script-messages.ts');

    expect(swMessagesText).not.toContain("export type * from './sw-port-messages'");
    expect(swMessagesText).not.toContain('CsInboundMessage');
    expect(swPortMessagesText).toContain('export type UiPortOutboundMessage');
    expect(swPortMessagesText).toContain("type: 'object/stream'");
    expect(contentScriptMessagesText).toContain('export type CsInboundMessage');
    expect(contentScriptMessagesText).toContain('export type PageToolOpenResponse');
  });
});
