// Embed template images as base64 data URLs at send time (inside HTML, not MIME attachments).
// CRM preview keeps remote https:// URLs; only outgoing SMTP mail is rewritten.
// Unlike CID attachments, data URLs do not appear as separate files when replying.

const LOGO_ORIGIN = 'https://hydrogenro.com';
const BRAND_ORIGINS = ['https://hydrogenro.com', 'https://elevenro.com'];

/** @type {{ id: string; fetchUrl: string; patterns: RegExp[] }[]} */
const INLINE_IMAGE_SPECS = [
  {
    id: 'logo-light',
    fetchUrl: `${LOGO_ORIGIN}/logo-dark.webp`,
    patterns: [
      /https:\/\/hydrogenro\.com\/logo-dark\.webp/gi,
      /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/logo-dark\.webp/gi,
    ],
  },
  {
    id: 'logo-dark',
    fetchUrl: `${LOGO_ORIGIN}/logo-white.webp`,
    patterns: [
      /https:\/\/hydrogenro\.com\/logo-white\.webp/gi,
      /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/logo-white\.webp/gi,
    ],
  },
  {
    id: 'whatsapp',
    fetchUrl: `${LOGO_ORIGIN}/whatsapp.png`,
    patterns: BRAND_ORIGINS.map(
      (origin) => new RegExp(`${origin.replace(/\./g, '\\.')}/whatsapp\\.png`, 'gi')
    ).concat(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/whatsapp(?:%20\(1\))?\.png/gi),
  },
  {
    id: 'phone',
    fetchUrl: `${LOGO_ORIGIN}/telephone-call.png`,
    patterns: BRAND_ORIGINS.map(
      (origin) => new RegExp(`${origin.replace(/\./g, '\\.')}/telephone-call\\.png`, 'gi')
    ).concat(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/telephone-call\.png/gi),
  },
];

function contentTypeFromUrl(url) {
  if (/\.webp$/i.test(url)) return 'image/webp';
  if (/\.png$/i.test(url)) return 'image/png';
  if (/\.jpe?g$/i.test(url)) return 'image/jpeg';
  if (/\.gif$/i.test(url)) return 'image/gif';
  return 'application/octet-stream';
}

function toDataUrl(buffer, contentType) {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      throw new Error('empty response');
    }
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

function rewriteHtmlForDataUrls(html, embedded) {
  let next = html;
  for (const { patterns, dataUrl } of embedded) {
    for (const pattern of patterns) {
      next = next.replace(pattern, dataUrl);
    }
  }
  return next;
}

/**
 * @param {string} html
 * @returns {Promise<{ html: string }>}
 */
async function embedInlineEmailImages(html) {
  if (!html || typeof html !== 'string') {
    return { html: html || '' };
  }

  const embedded = [];

  await Promise.all(
    INLINE_IMAGE_SPECS.map(async (spec) => {
      const hasMatch = spec.patterns.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(html);
      });
      if (!hasMatch) return;

      try {
        const content = await fetchImageBuffer(spec.fetchUrl);
        const contentType = contentTypeFromUrl(spec.fetchUrl);
        embedded.push({
          patterns: spec.patterns,
          dataUrl: toDataUrl(content, contentType),
        });
      } catch (error) {
        console.warn('[email-inline-images] fetch failed, keeping remote URL', {
          id: spec.id,
          url: spec.fetchUrl,
          error: error && error.message,
        });
      }
    })
  );

  if (!embedded.length) {
    return { html };
  }

  return {
    html: rewriteHtmlForDataUrls(html, embedded),
  };
}

module.exports = {
  embedInlineEmailImages,
  INLINE_IMAGE_SPECS,
};
