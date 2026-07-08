// Embed template images (logo, WhatsApp, phone icons) as CID attachments at send time.
// CRM preview keeps remote https:// URLs; only outgoing SMTP mail is rewritten.

const LOGO_ORIGIN = 'https://hydrogenro.com';
const BRAND_ORIGINS = ['https://hydrogenro.com', 'https://elevenro.com'];

/** @type {{ cid: string; fetchUrl: string; patterns: RegExp[] }[]} */
const INLINE_IMAGE_SPECS = [
  {
    cid: 'logo-light',
    fetchUrl: `${LOGO_ORIGIN}/logo-dark.webp`,
    patterns: [
      /https:\/\/hydrogenro\.com\/logo-dark\.webp/gi,
      /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/logo-dark\.webp/gi,
    ],
  },
  {
    cid: 'logo-dark',
    fetchUrl: `${LOGO_ORIGIN}/logo-white.webp`,
    patterns: [
      /https:\/\/hydrogenro\.com\/logo-white\.webp/gi,
      /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/logo-white\.webp/gi,
    ],
  },
  {
    cid: 'whatsapp',
    fetchUrl: `${LOGO_ORIGIN}/whatsapp.png`,
    patterns: BRAND_ORIGINS.map(
      (origin) => new RegExp(`${origin.replace(/\./g, '\\.')}/whatsapp\\.png`, 'gi')
    ).concat(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/whatsapp(?:%20\(1\))?\.png/gi),
  },
  {
    cid: 'phone',
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

function filenameFromUrl(url, cid) {
  const match = url.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  const ext = match ? match[1].toLowerCase() : 'bin';
  return `${cid}.${ext}`;
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

function rewriteHtmlForCid(html, specs) {
  let next = html;
  for (const spec of specs) {
    const replacement = `cid:${spec.cid}`;
    for (const pattern of spec.patterns) {
      next = next.replace(pattern, replacement);
    }
  }
  return next;
}

/**
 * @param {string} html
 * @returns {Promise<{ html: string; attachments: object[] }>}
 */
async function embedInlineEmailImages(html) {
  if (!html || typeof html !== 'string') {
    return { html: html || '', attachments: [] };
  }

  const embeddedSpecs = [];
  const attachments = [];

  await Promise.all(
    INLINE_IMAGE_SPECS.map(async (spec) => {
      const hasMatch = spec.patterns.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(html);
      });
      if (!hasMatch) return;

      try {
        const content = await fetchImageBuffer(spec.fetchUrl);
        attachments.push({
          filename: filenameFromUrl(spec.fetchUrl, spec.cid),
          content,
          cid: spec.cid,
          contentType: contentTypeFromUrl(spec.fetchUrl),
        });
        embeddedSpecs.push(spec);
      } catch (error) {
        console.warn('[email-inline-images] fetch failed, keeping remote URL', {
          cid: spec.cid,
          url: spec.fetchUrl,
          error: error && error.message,
        });
      }
    })
  );

  if (!embeddedSpecs.length) {
    return { html, attachments: [] };
  }

  return {
    html: rewriteHtmlForCid(html, embeddedSpecs),
    attachments,
  };
}

module.exports = {
  embedInlineEmailImages,
  INLINE_IMAGE_SPECS,
};
