(() => {
  const REQUEST_TYPE = 'olyq:technology-stack:js-signals:request';
  const RESPONSE_TYPE = 'olyq:technology-stack:js-signals:response';
  const MAX_VALUE_LENGTH = 96;
  const DEFAULT_CHAINS = [
    'React',
    'React.version',
    '__REACT_DEVTOOLS_GLOBAL_HOOK__',
    '__NEXT_DATA__',
    'next',
    'Vue',
    '__VUE__',
    '__VUE_DEVTOOLS_GLOBAL_HOOK__',
    '__NUXT__',
    'ng',
    'jQuery',
    '$',
    'Shopify',
    'ga',
    'gtag',
    'dataLayer',
    'grecaptcha',
    'Stripe',
    'webpackChunk',
    'moment',
    'moment.version',
    'Hammer',
    'Hammer.VERSION',
    '__core-js_shared__',
    '__core-js_shared__.versions.0.version',
    '_ethers',
  ];

  const readChain = (chain) => {
    const parts = String(chain || '').split('.').filter(Boolean);
    let value = window;
    for (const part of parts) {
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
      if (!Object.prototype.hasOwnProperty.call(value, part)) return undefined;
      value = value[part];
    }
    if (value == null) return undefined;
    const type = typeof value;
    if (type === 'string') return value.slice(0, MAX_VALUE_LENGTH);
    if (type === 'number' || type === 'boolean') return value;
    return true;
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== REQUEST_TYPE) return;
    const signals = {};
    const chains = Array.isArray(event.data.chains) && event.data.chains.length > 0
      ? event.data.chains
      : DEFAULT_CHAINS;
    for (const chain of chains) {
      try {
        const value = readChain(chain);
        if (value !== undefined) signals[chain] = value;
      } catch {
        // 缺失或读取失败的 chain 不回传，避免把 absent 当成 false 信号。
      }
    }
    window.postMessage({
      type: RESPONSE_TYPE,
      requestId: event.data.requestId,
      signals,
    }, '*');
  });
})();
