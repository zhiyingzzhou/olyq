/**
 * 说明：`readable-dom` 多场景正文采集测试。
 *
 * 职责：
 * - 用本地 fixture 覆盖论坛列表、高链接密度列表、文章、文档代码、表格、SPA 与 Shadow DOM；
 * - 验证登录墙、挑战页、图片 / Canvas 和空正文只降级到元数据；
 * - 确保全文模式采集的是当前已渲染可见 DOM，而不是 Readability 的短文本误抽取。
 *
 * 边界：
 * - 本测试不访问真实站点，也不做站点白名单断言；
 * - 虚拟滚动、懒加载只验证当前 DOM 已渲染内容。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractReadableDocumentFromStableDom,
} from './readable-dom';

/** 构造内容脚本正文采集所需的基础页面身份。 */
function createBasePayload(title = 'Fixture Page') {
  return {
    title,
    url: 'https://example.com/fixture',
    extractedAt: 1,
    pageFingerprint: 'fixture-fingerprint',
    routeKey: 'https://example.com/fixture',
    stableWindowVersion: 1,
  };
}

/** 重置当前 jsdom 文档。 */
function setDocumentHtml(html: string, title = 'Fixture Page'): void {
  document.title = title;
  document.body.innerHTML = html;
}

describe('readable-dom extraction engine', () => {
  beforeEach(() => {
    setDocumentHtml('');
  });

  it('全文模式会把 NodeSeek 类论坛列表抽成结构列表，而不是登录或版权短文本', async () => {
    setDocumentHtml(`
      <header class="navbar"><a>首页</a><a>登录</a><a>注册</a></header>
      <aside class="login-panel">登录 注册 忘记密码 在线用户统计</aside>
      <main id="nsk-frame">
        <h1>NodeSeek 热门主题</h1>
        <ul class="post-list">
          <li><a>VPS 线路回程测试工具发布</a><span>技术交流 · 32 回复 · 2 小时前</span></li>
          <li><a>2026 年云服务器优惠汇总</a><span>优惠信息 · 91 回复 · 今日更新</span></li>
          <li><a>自建监控面板的轻量方案</a><span>开发讨论 · 18 回复 · 昨天</span></li>
          <li><a>IPv6-only 机器的代理配置经验</a><span>网络技术 · 27 回复 · 本周</span></li>
          <li><a>开源项目镜像站维护公告</a><span>站务 · 15 回复 · 3 天前</span></li>
        </ul>
      </main>
      <footer>Copyright 2026 NodeSeek</footer>
    `, 'NodeSeek');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('NodeSeek'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('structured-page');
    expect(payload.text).toContain('VPS 线路回程测试工具发布');
    expect(payload.text).toContain('IPv6-only 机器的代理配置经验');
    expect(payload.text).not.toContain('忘记密码');
    expect(payload.text).not.toContain('Copyright 2026');
    expect(payload.structuredItemCount).toBeGreaterThanOrEqual(5);
    expect(payload.contentChars).toBeGreaterThan(120);
  });

  it('Hacker News / Reddit 类高链接密度页面保留列表顺序和条目元信息', async () => {
    setDocumentHtml(`
      <main>
        <h1>Top Stories</h1>
        <ol class="story-list">
          <li><a>SQLite on the server: a practical guide</a><span>412 points by alex 4 hours ago | 98 comments</span></li>
          <li><a>Show HN: Tiny search engine for personal notes</a><span>128 points by mika 2 hours ago | 31 comments</span></li>
          <li><a>Understanding CSS anchor positioning</a><span>76 points by lee 1 hour ago | 14 comments</span></li>
          <li><a>Rust compiler performance notes</a><span>65 points by sam 35 minutes ago | 8 comments</span></li>
        </ol>
      </main>
    `, 'HN Fixture');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('HN Fixture'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('structured-page');
    expect(payload.text).toContain('1. SQLite on the server');
    expect(payload.text).toContain('4. Rust compiler performance notes');
    expect(payload.text).toContain('98 comments');
  });

  it('普通文章页在普通模式下优先通过质量门槛后的 article 模式', async () => {
    setDocumentHtml(`
      <main>
        <article>
          <h1>Browser extension content script boundaries</h1>
          <p>Content scripts run in an isolated world but can read the current page DOM, so body extraction must treat visible structure as first-class input.</p>
          <p>Article pages are a good fit for a reader-view extractor, but short login prompts or footer copyright snippets must be rejected by quality gates.</p>
          <p>This keeps ordinary news, blogs, and documentation clean while avoiding false success on forum indexes or directory pages.</p>
        </article>
      </main>
    `, '文章 Fixture');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('文章 Fixture'), {
      intent: 'normal',
    });

    expect(payload.mode).toBe('article');
    expect(payload.text).toContain('Content scripts run in an isolated world');
    expect(payload.headings).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Browser extension content script boundaries' }),
    ]));
  });

  it('文档/API 页面会保留标题、段落和代码块', async () => {
    setDocumentHtml(`
      <main>
        <h1>Messages API</h1>
        <section>
          <h2>Create a message</h2>
          <p>Use this endpoint to create a response from the current model configuration.</p>
          <pre><code class="language-ts">const response = await client.messages.create({
  model: 'demo',
  input: 'Hello'
});</code></pre>
        </section>
      </main>
    `, 'API Docs');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('API Docs'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('visible-page');
    expect(payload.text).toContain('# Messages API');
    expect(payload.text).toContain('```ts');
    expect(payload.text).toContain('client.messages.create');
  });

  it('正常 Cloudflare 配置说明页不会因为品牌词被误判为 challenge', async () => {
    setDocumentHtml(`
      <main>
        <h1>配置说明 | CloudFlare ImgBed</h1>
        <section>
          <h2>存储配置</h2>
          <p>这个页面说明如何为 Cloudflare R2 图床配置桶名称、自定义域名、访问密钥和上传路径。</p>
          <p>部署完成后需要设置环境变量，并在控制台确认图片访问策略、缓存策略和鉴权规则。</p>
          <ul>
            <li>确认 Account ID、Bucket Name 和 Public URL 已填写。</li>
            <li>检查 API Token 只授予对象读写权限。</li>
            <li>上传完成后通过预览链接验证图片是否能正常打开。</li>
          </ul>
        </section>
      </main>
    `, '配置说明 | CloudFlare ImgBed');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('配置说明 | CloudFlare ImgBed'), {
      intent: 'full-page',
    });

    expect(payload.mode).not.toBe('metadata-only');
    expect(payload.degradeReason).not.toBe('challenge-page');
    expect(payload.text).toContain('Cloudflare R2 图床配置');
    expect(payload.text).toContain('API Token');
  });

  it('表格/搜索结果页会保留表格行列内容', async () => {
    setDocumentHtml(`
      <main>
        <h1>Search results</h1>
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            <tr><td>Readable DOM redesign</td><td>Open</td><td>2026-05-21</td></tr>
            <tr><td>Browser context quality gate</td><td>Review</td><td>2026-05-20</td></tr>
            <tr><td>Structured page fixtures</td><td>Done</td><td>2026-05-19</td></tr>
          </tbody>
        </table>
      </main>
    `, 'Search');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Search'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('structured-page');
    expect(payload.text).toContain('| Name | Status | Updated |');
    expect(payload.text).toContain('Readable DOM redesign');
    expect(payload.text).toContain('Structured page fixtures');
  });

  it('SPA 首屏渲染的 div 卡片也能按当前 DOM 采集', async () => {
    setDocumentHtml(`
      <div id="root">
        <main>
          <h1>Deployment Dashboard</h1>
          <div class="result-grid">
            <div class="result-card"><strong>Production</strong><span>Healthy · 24 pods · latency 82ms</span></div>
            <div class="result-card"><strong>Staging</strong><span>Warning · migration pending · latency 110ms</span></div>
            <div class="result-card"><strong>Preview</strong><span>Healthy · 7 branches · latency 95ms</span></div>
            <div class="result-card"><strong>Workers</strong><span>Healthy · queue depth 12 · retries 0</span></div>
          </div>
        </main>
      </div>
    `, 'SPA');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('SPA'), {
      intent: 'full-page',
    });

    expect(['visible-page', 'structured-page']).toContain(payload.mode);
    expect(payload.text).toContain('Deployment Dashboard');
    expect(payload.text).toContain('migration pending');
    expect(payload.text).toContain('queue depth 12');
  });

  it('Notus 类响应式营销页不会让短部署日志列表压过整页可见正文', async () => {
    setDocumentHtml(`
      <main>
        <section class="hero">
          <p>For fast moving engineering teams.</p>
          <h1>Manage and simulate agentic workflows</h1>
          <p>We empower developers and technical teams to create, simulate, and manage AI-driven workflows visually.</p>
          <p>Start building View pricing Innovative AI solution 2025 by trusted teams.</p>
        </section>
        <section class="workflow">
          <p>How it works</p>
          <h2>Integrates easily</h2>
          <p>We empower developers and technical teams to create, simulate, and manage AI-driven workflows visually.</p>
          <div class="cards">
            <div>
              <h3>Design your Workflow</h3>
              <p>A drag-and-drop interface to create, connect, and configure agents into logical workflows.</p>
            </div>
            <div>
              <h3>Connect your Tools</h3>
              <p>Agents operate independently and coordinate tasks to complete complex goals together.</p>
            </div>
            <div>
              <h3>Deploy & Scale</h3>
              <p>Run agent workflows in a sandbox to preview behavior, debug logic, and test interactions.</p>
              <div class="mobile-demo-log">
                ${Array.from({ length: 18 }, (_, index) => `
                  <div>
                    <span>deploy-${index % 2 === 0 ? 'dev' : 'prod'}-${['eu', 'us', 'ap'][index % 3]}-${324 + index}</span>
                    <span>${index + 1}h ago</span>
                    <span>${index % 3 === 0 ? 'master' : index % 3 === 1 ? 'main' : 'feature/auth'}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </section>
        <section class="features">
          <h2>Built for Agentic Intelligence</h2>
          <p>Build, test and deploy AI agents with a powerful visual interface designed for technical teams.</p>
          <div>
            <h3>LLM Model Selector</h3>
            <p>Track real-time activity of agents with detailed records of triggers, tools used, outcomes, and timestamps.</p>
          </div>
          <div>
            <h3>Native Tools Integration</h3>
            <p>Connect model providers, internal tools, and workflow actions without leaving the builder.</p>
          </div>
        </section>
        <section class="industries">
          <h2>Across various Industries</h2>
          <p>DevOps, SalesOps, Supply Chain, Customer Support, DataOps and FinOps teams can use the same visual workflow primitives.</p>
        </section>
      </main>
    `, 'Notus Fixture');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Notus Fixture'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('visible-page');
    expect(payload.text).toContain('Manage and simulate agentic workflows');
    expect(payload.text).toContain('Built for Agentic Intelligence');
    expect(payload.text.indexOf('deploy-dev-eu-324')).toBeGreaterThan(payload.text.indexOf('Manage and simulate agentic workflows'));
    expect(payload.headings).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Manage and simulate agentic workflows' }),
      expect.objectContaining({ text: 'Built for Agentic Intelligence' }),
    ]));
    expect(payload.structuredItemCount).toBeUndefined();
  });

  it('Playwright 报告里出现 Cloudflare / challenge 用例名时仍采集报告正文', async () => {
    setDocumentHtml(`
      <main>
        <h1>Playwright Test Report</h1>
        <section>
          <h2>readable-dom extraction engine</h2>
          <ul>
            <li>Cloudflare / challenge 页面稳定降级为元数据 · passed</li>
            <li>正常 Cloudflare 配置说明页不会因为品牌词被误判为 challenge · passed</li>
            <li>SPA 首屏渲染的 div 卡片也能按当前 DOM 采集 · passed</li>
            <li>文档/API 页面会保留标题、段落和代码块 · passed</li>
          </ul>
          <p>报告页面展示测试名称、状态、耗时和错误摘要，这些都是可读正文，不是安全验证壳。</p>
        </section>
      </main>
    `, 'Playwright Test Report');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Playwright Test Report'), {
      intent: 'full-page',
    });

    expect(payload.mode).not.toBe('metadata-only');
    expect(payload.degradeReason).not.toBe('challenge-page');
    expect(payload.text).toContain('Cloudflare / challenge 页面稳定降级为元数据');
    expect(payload.text).toContain('SPA 首屏渲染的 div 卡片也能按当前 DOM 采集');
  });

  it('开放 Shadow DOM 下的正文会被采集', async () => {
    setDocumentHtml('<main><h1>Host Page</h1><article id="shadow-host"></article></main>', 'Shadow');
    const host = document.getElementById('shadow-host');
    const shadowRoot = host?.attachShadow({ mode: 'open' });
    if (!shadowRoot) throw new Error('shadow root unavailable');
    const section = document.createElement('section');
    section.innerHTML = `
      <h2>Shadow rendered content</h2>
      <p>This paragraph lives inside an open shadow root and should be visible to the extractor.</p>
    `;
    shadowRoot.appendChild(section);

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Shadow'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('visible-page');
    expect(payload.text).toContain('Shadow rendered content');
    expect(payload.text).toContain('open shadow root');
  });

  it('登录墙不会被伪造成正文成功态', async () => {
    setDocumentHtml(`
      <main class="login-wall">
        <h1>Login required</h1>
        <form>
          <label>Email <input /></label>
          <label>Password <input type="password" /></label>
          <button>Sign in</button>
        </form>
      </main>
    `, 'Login');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Login'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('metadata-only');
    expect(payload.degradeReason).toBe('login-wall');
    expect(payload.text).toBe('');
  });

  it('Cloudflare / challenge 页面稳定降级为元数据', async () => {
    setDocumentHtml(`
      <main>
        <h1>Just a moment...</h1>
        <p>Checking your browser before accessing the site. Cloudflare needs to verify you are human.</p>
      </main>
    `, 'Just a moment...');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Just a moment...'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('metadata-only');
    expect(payload.degradeReason).toBe('challenge-page');
    expect(payload.text).toBe('');
  });

  it('Turnstile 结构信号加短人机验证文案仍稳定降级为元数据', async () => {
    setDocumentHtml(`
      <main id="cf-chl-widget">
        <h1>安全检查</h1>
        <p>请完成人机验证以继续。</p>
        <div class="cf-turnstile" data-sitekey="demo-site-key"></div>
      </main>
    `, '安全检查');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('安全检查'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('metadata-only');
    expect(payload.degradeReason).toBe('challenge-page');
    expect(payload.text).toBe('');
  });

  it('图片 / Canvas only 页面不伪造 OCR 文本', async () => {
    setDocumentHtml(`
      <main>
        <img src="poster.png" alt="" />
        <canvas width="800" height="400"></canvas>
      </main>
    `, 'Image Only');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Image Only'), {
      intent: 'full-page',
    });

    expect(payload.mode).toBe('metadata-only');
    expect(payload.degradeReason).toBe('image-or-canvas-only');
    expect(payload.text).toBe('');
  });

  it('空正文和短版权页脚不会作为正文成功态', async () => {
    setDocumentHtml(`
      <footer>Copyright 2026 Example. Privacy Policy. Terms of Service.</footer>
    `, 'Empty');

    const payload = await extractReadableDocumentFromStableDom(createBasePayload('Empty'), {
      intent: 'normal',
    });

    expect(payload.mode).toBe('metadata-only');
    expect(payload.degradeReason).toBe('empty-body');
    expect(payload.text).toBe('');
  });
});
