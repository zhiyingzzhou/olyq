const googleFontsCssBase = 'https://fonts.googleapis.com/css2';
const fontCssCache = new Map();

function googleFontsUrl({ family, weights, text }) {
  const params = new URLSearchParams();
  params.set('family', `${family}:wght@${weights.join(';')}`);
  params.set('display', 'swap');
  if (text) params.set('text', text);
  return `${googleFontsCssBase}?${params.toString()}`;
}

async function fetchDataUri(url, fallbackContentType) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load store asset font ${url}: HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || fallbackContentType;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Store asset font is empty: ${url}`);
  }
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function embedFontFiles(css) {
  const fontUrls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g), (match) => match[1]);
  let embeddedCss = css;
  for (const url of new Set(fontUrls)) {
    const dataUri = await fetchDataUri(url, 'font/ttf');
    embeddedCss = embeddedCss.replaceAll(url, dataUri);
  }
  return embeddedCss;
}

async function loadGoogleFontCss(config) {
  const url = googleFontsUrl(config);
  if (fontCssCache.has(url)) return fontCssCache.get(url);

  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 OlyqStoreAssetGenerator/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load Google Fonts CSS ${url}: HTTP ${response.status}`);
  }
  const css = await embedFontFiles(await response.text());
  fontCssCache.set(url, css);
  return css;
}

export async function buildStoreAssetFontCss({ includeChinese = false, chineseText = '' } = {}) {
  const cssBlocks = [
    await loadGoogleFontCss({ family: 'Sora', weights: [400, 500, 600, 700, 800] }),
  ];

  if (includeChinese) {
    cssBlocks.push(await loadGoogleFontCss({
      family: 'Noto Sans SC',
      weights: [400, 500, 600, 700, 800],
      text: chineseText,
    }));
  }

  return cssBlocks.join('\n');
}
