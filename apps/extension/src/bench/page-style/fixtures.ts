/**
 * 说明：`fixtures` 页面风格 benchmark 样本页面模块。
 *
 * 职责：
 * - 为 page-style benchmark 提供稳定、可重复的 synthetic 页面样本；
 * - 保证 benchmark 和真实 page-style 内核运行在同一份 DOM/CSS 语义上；
 * - 只负责渲染页面样本，不直接做计时、调用计数或报告输出。
 *
 * 边界：
 * - 本模块只服务 benchmark 页面，不进入扩展默认主路径；
 * - 不修改 page-style 对外协议，也不依赖 SW / content-script message；
 * - 页面控制 UI 会放在 `__olyq_shadow_host__` 下，由采样器主动跳过。
 */

/** page-style benchmark 支持的样本页类型。 */
export type PageStyleBenchmarkFixtureId = 'feature-rich' | 'sparse' | 'dense';

/**
 * 渲染指定的 benchmark 页面样本。
 *
 * @param fixtureId - 样本页类型。
 * @param host - benchmark 专用渲染容器。
 */
export function renderPageStyleBenchmarkFixture(
  fixtureId: PageStyleBenchmarkFixtureId,
  host: HTMLElement,
): void {
  switch (fixtureId) {
    case 'feature-rich':
      renderFeatureRichFixture(host);
      return;
    case 'sparse':
      renderSparseFixture(host);
      return;
    case 'dense':
      renderDenseFixture(host);
      return;
    default: {
      const exhaustiveCheck: never = fixtureId;
      throw new Error(`unsupported fixture: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * 重置样本页公共状态，避免不同 fixture 之间互相污染。
 *
 * @param fixtureId - 当前样本页类型。
 * @param bodyStyles - 需要写入 `document.body` 的样式。
 */
function resetFixtureShell(fixtureId: PageStyleBenchmarkFixtureId, bodyStyles: string[]): void {
  document.title = `Page Style Benchmark — ${fixtureId}`;
  history.replaceState({}, '', `/bench/page-style/${fixtureId}`);
  document.documentElement.style.cssText = '';
  document.documentElement.removeAttribute('data-theme');
  document.body.className = '';
  document.body.setAttribute('style', bodyStyles.join('; '));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/**
 * 渲染富样式营销页样本。
 *
 * @param host - benchmark 专用渲染容器。
 */
function renderFeatureRichFixture(host: HTMLElement): void {
  resetFixtureShell('feature-rich', [
    'margin: 0',
    'background: rgb(250, 248, 240)',
    'color: rgb(34, 34, 34)',
    'font-family: Inter, sans-serif',
    'font-size: 16px',
    'line-height: 24px',
  ]);
  document.documentElement.setAttribute('data-theme', 'warm');

  host.innerHTML = `
    <nav style="position: sticky; top: 0; z-index: 5; backdrop-filter: blur(14px); background: rgba(255, 255, 255, 0.82); border-bottom: 1px solid rgb(220, 220, 220); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);">
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-family: 'Playfair Display', serif; font-size: 20px;">Acme Atelier</strong>
        <div style="display: flex; gap: 20px;">
          <a href="/work" style="color: rgb(92, 54, 214); text-decoration: none;">Work</a>
          <a href="/journal" style="color: rgb(92, 54, 214); text-decoration: none;">Journal</a>
          <a href="/contact" style="color: rgb(92, 54, 214); text-decoration: none;">Contact</a>
        </div>
      </div>
    </nav>
    <header style="background-image: linear-gradient(135deg, rgb(255, 240, 230), rgb(248, 248, 255)); padding: 72px 24px 96px;">
      <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr); gap: 36px; align-items: center;">
        <div>
          <p style="display: inline-flex; margin: 0 0 20px; padding: 8px 16px; border-radius: 999px; background: rgba(255, 255, 255, 0.74); color: rgb(46, 76, 145);">Design system for thoughtful teams</p>
          <h1 style="margin: 0 0 20px; font-family: 'Playfair Display', serif; font-size: clamp(48px, 6vw, 72px); line-height: 0.96;">Editorial-grade interfaces without design debt.</h1>
          <h2 style="margin: 0 0 20px; font-family: 'Playfair Display', serif; font-size: clamp(26px, 3vw, 34px); font-weight: 600; line-height: 1.1;">One platform for landing pages, launch kits, and product narratives.</h2>
          <p style="max-width: 56ch; margin: 0 0 28px;">A single workspace for gradients, glass surfaces, dense content systems, and launch-day flows that still feel hand-built.</p>
          <div style="display: flex; gap: 14px; flex-wrap: wrap;">
            <button style="border: 0; padding: 14px 22px; border-radius: 999px; background: rgb(20, 120, 230); color: rgb(255, 255, 255); font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(20, 120, 230, 0.32);">Start a build</button>
            <button style="border: 1px solid rgba(20, 120, 230, 0.18); padding: 14px 22px; border-radius: 999px; background: rgba(255, 255, 255, 0.76); color: rgb(42, 53, 75); font-size: 14px; font-weight: 600; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.10);">Review the system</button>
            <button style="border: 0; padding: 14px 22px; border-radius: 999px; background: rgb(42, 136, 242); color: rgb(255, 255, 255); font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(42, 136, 242, 0.32);">See examples</button>
          </div>
        </div>
        <div style="display: grid; gap: 18px;">
          <article class="card" style="padding: 24px; background: rgba(255, 255, 255, 0.86); border: 1px solid rgb(224, 224, 232); border-radius: 24px; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12); backdrop-filter: blur(18px);">
            <strong style="display: block; margin-bottom: 8px;">Launch surface</strong>
            <p style="margin: 0;">Hero narratives, social proof, and editorial blocks share one token system.</p>
          </article>
          <article class="card" style="padding: 24px; background: rgba(250, 252, 255, 0.92); border: 1px solid rgb(220, 225, 235); border-radius: 22px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.10);">
            <strong style="display: block; margin-bottom: 8px;">Operations panel</strong>
            <p style="margin: 0;">Forms, release checklists, and compact utilities remain consistent with the marketing layer.</p>
          </article>
        </div>
      </div>
    </header>
    <main style="max-width: 1200px; margin: 0 auto; padding: 56px 24px 120px;">
      <section style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-bottom: 56px;">
        <article class="card" style="padding: 28px; background: rgba(255, 255, 255, 0.88); border: 1px solid rgb(224, 224, 232); border-radius: 24px; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12);">
          <span style="display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgb(235, 242, 255); color: rgb(46, 76, 145);">Signals</span>
          <h3 style="margin-bottom: 12px; font-size: 26px; font-family: 'Playfair Display', serif;">Stable prompt context</h3>
          <p style="margin-bottom: 0;">Collect headings, layout rhythms, visual treatments, and component patterns with one sampling pass.</p>
        </article>
        <article class="card" style="padding: 28px; background: rgba(252, 247, 241, 0.96); border: 1px solid rgb(231, 224, 214); border-radius: 20px; box-shadow: 0 14px 36px rgba(120, 86, 40, 0.10);">
          <span style="display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgb(255, 240, 230); color: rgb(138, 76, 46);">Decor</span>
          <h3 style="margin-bottom: 12px; font-size: 26px; font-family: 'Playfair Display', serif;">Gradient and glass aware</h3>
          <p style="margin-bottom: 0;">Gradients, shadows, borders, and blur are normalized as structured style hints instead of raw string guesses.</p>
        </article>
        <article class="card" style="padding: 28px; background: rgba(243, 247, 255, 0.96); border: 1px solid rgb(212, 221, 236); border-radius: 18px; box-shadow: 0 12px 32px rgba(32, 74, 135, 0.10);">
          <span style="display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgb(230, 240, 255); color: rgb(32, 74, 135);">Reuse</span>
          <h3 style="margin-bottom: 12px; font-size: 26px; font-family: 'Playfair Display', serif;">Snapshot-friendly</h3>
          <p style="margin-bottom: 0;">Cold path, warm path, and invalidation path are isolated so the same topic can safely reuse page style context.</p>
        </article>
      </section>
      <section style="display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; margin-bottom: 56px;">
        <div style="display: grid; gap: 24px;">
          <article style="padding: 28px; background: rgb(255, 255, 255); border-radius: 22px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">
            <h3 style="margin-top: 0; font-size: 28px; font-family: 'Playfair Display', serif;">Long-form story modules</h3>
            <p>Each section preserves generous spacing, a centered content frame, and predictable card silhouettes.</p>
            <p>That gives the benchmark enough typography, spacing, border, and shadow samples to exercise the real extraction path.</p>
            <a href="/learn" style="color: rgb(92, 54, 214);">Read the implementation notes</a>
          </article>
          <article style="padding: 28px; background: rgb(255, 255, 255); border-radius: 20px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">
            <h3 style="margin-top: 0; font-size: 28px; font-family: 'Playfair Display', serif;">Structured inputs</h3>
            <label style="display: block; margin-bottom: 8px;">Work email</label>
            <input aria-label="Email" value="team@example.com" style="width: 100%; box-sizing: border-box; padding: 14px 16px; border: 1px solid rgb(220, 220, 220); border-radius: 12px; background: rgb(255, 255, 255);" />
          </article>
        </div>
        <aside style="display: grid; gap: 18px;">
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='420' viewBox='0 0 320 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ffd6c2'/%3E%3Cstop offset='100%25' stop-color='%23d7e6ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='320' height='420' rx='28' fill='url(%23g)'/%3E%3Ccircle cx='84' cy='124' r='42' fill='rgba(255,255,255,0.72)'/%3E%3Crect x='42' y='208' width='236' height='24' rx='12' fill='rgba(255,255,255,0.72)'/%3E%3Crect x='42' y='248' width='196' height='24' rx='12' fill='rgba(255,255,255,0.72)'/%3E%3Crect x='42' y='288' width='146' height='24' rx='12' fill='rgba(255,255,255,0.72)'/%3E%3C/svg%3E" alt="Hero visual" style="width: 100%; height: auto; border-radius: 28px; display: block;" />
          <svg viewBox="0 0 120 120" aria-hidden="true" style="width: 56px; height: 56px;">
            <circle cx="60" cy="60" r="48" fill="rgba(92, 54, 214, 0.12)" />
            <path d="M32 64c12-25 41-33 56-26-17 2-26 18-22 34-11-9-23-11-34-8z" fill="rgb(92, 54, 214)" />
          </svg>
        </aside>
      </section>
      <section style="display: grid; gap: 28px;">
        <article style="padding: 32px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgb(224, 224, 232); border-radius: 24px; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.10);">
          <h3 style="margin-top: 0; font-size: 30px; font-family: 'Playfair Display', serif;">Roomy closing section</h3>
          <p style="margin-bottom: 0;">A taller final section makes the document long enough to benchmark scroll-only metrics refresh and screenshot-oriented layout reads.</p>
        </article>
        <article style="padding: 32px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgb(224, 224, 232); border-radius: 24px; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.10); min-height: 640px;">
          <h3 style="margin-top: 0; font-size: 30px; font-family: 'Playfair Display', serif;">Scrolling tail</h3>
          <p>Benchmark filler keeps the page tall without changing the component mix.</p>
          <p>That helps isolate scroll and resize behavior from semantic drift.</p>
        </article>
      </section>
    </main>
  `;
}

/**
 * 渲染稀疏语义页样本。
 *
 * @param host - benchmark 专用渲染容器。
 */
function renderSparseFixture(host: HTMLElement): void {
  resetFixtureShell('sparse', [
    'margin: 0',
    'background: rgb(255, 255, 255)',
    'color: rgb(30, 30, 30)',
    'font-family: Georgia, serif',
    'font-size: 18px',
    'line-height: 28px',
  ]);

  host.innerHTML = `
    <main style="max-width: 720px; margin: 0 auto; padding: 40px 24px 80px;">
      <div style="padding: 28px; border-radius: 18px; background: rgb(255, 255, 255); box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);">
        <p style="margin-top: 0;">Only a plain block of copy with one actionable link and one button.</p>
        <p>There is intentionally no strong section hierarchy, no hero module, and almost no decorative treatment.</p>
        <a href="/detail" style="color: rgb(25, 96, 196);">Read details</a>
        <div style="height: 16px;"></div>
        <button style="border: 0; background: rgb(25, 96, 196); color: rgb(255, 255, 255); border-radius: 12px; padding: 12px 18px;">Continue</button>
      </div>
    </main>
  `;
}

/**
 * 渲染长列表和组件密集页样本。
 *
 * @param host - benchmark 专用渲染容器。
 */
function renderDenseFixture(host: HTMLElement): void {
  resetFixtureShell('dense', [
    'margin: 0',
    'background: rgb(245, 247, 251)',
    'color: rgb(20, 26, 38)',
    'font-family: Inter, sans-serif',
    'font-size: 16px',
    'line-height: 24px',
  ]);
  document.documentElement.setAttribute('data-theme', 'catalog');
  document.body.className = 'catalog-page';

  const buttonMarkup = Array.from({ length: 18 }, (_, index) => (
    `<button style="border: 0; background: rgb(${40 + index}, ${110 + index}, ${190 + index}); color: rgb(255, 255, 255); border-radius: 999px; padding: 12px 18px;">CTA ${index + 1}</button>`
  )).join('');
  const cardMarkup = Array.from({ length: 24 }, (_, index) => (
    `<li class="card" style="list-style: none; padding: 22px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgb(220, 225, 235); border-radius: ${16 + (index % 4) * 2}px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);">
      <strong style="display: block; margin-bottom: 10px;">Card ${index + 1}</strong>
      <p style="margin: 0;">Dense component sample ${index + 1} with compact copy, border, shadow and rounded corners.</p>
    </li>`
  )).join('');
  const paragraphMarkup = Array.from({ length: 30 }, (_, index) => `<li style="margin-bottom: 10px;">Dense copy block ${index + 1}</li>`).join('');

  host.innerHTML = `
    <main style="max-width: 1280px; margin: 0 auto; padding: 32px 24px 120px;">
      <section style="padding: 24px 0 40px;">
        <h1 style="margin-top: 0; margin-bottom: 20px; font-size: clamp(42px, 4.4vw, 64px); line-height: 0.98;">Dense catalog benchmark</h1>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">${buttonMarkup}</div>
      </section>
      <section style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin-bottom: 40px;">
        <ul style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; padding: 0; margin: 0;">${cardMarkup}</ul>
      </section>
      <section style="padding: 28px; background: rgba(255, 255, 255, 0.84); border-radius: 28px; box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08); min-height: 760px;">
        <h2 style="margin-top: 0; font-size: 30px;">Dense list tail</h2>
        <ul style="padding-left: 20px; margin-bottom: 0;">${paragraphMarkup}</ul>
      </section>
    </main>
  `;
}
