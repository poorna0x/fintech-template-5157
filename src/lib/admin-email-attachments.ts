export interface EmailAttachmentPayload {
  filename: string;
  contentType: string;
  content: string;
  size: number;
}

export interface EmailAttachmentItem extends EmailAttachmentPayload {
  id: string;
}

export const EMAIL_ATTACHMENT_MAX_COUNT = 5;
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Known MIME map; unknown docs fall back to application/octet-stream. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dot: 'application/msword',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlt: 'application/vnd.ms-excel',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pot: 'application/vnd.ms-powerpoint',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  odg: 'application/vnd.oasis.opendocument.graphics',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  epub: 'application/epub+zip',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
  key: 'application/vnd.apple.keynote',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
};

/** Executables / scripts — not attachable by email. */
const BLOCKED_EXT = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'cpl',
  'scr',
  'js',
  'jse',
  'mjs',
  'vbs',
  'vbe',
  'ws',
  'wsf',
  'wsc',
  'wsh',
  'msi',
  'msp',
  'dll',
  'sys',
  'drv',
  'apk',
  'deb',
  'rpm',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'psc1',
  'jar',
  'hta',
  'inf',
  'reg',
  'lnk',
  'url',
  'iso',
  'dmg',
  'pkg',
  'app',
  'action',
  'command',
  'csh',
  'ksh',
  'php',
  'py',
  'rb',
  'pl',
]);

export const EMAIL_ATTACHMENT_ACCEPT = '*/*';

export const EMAIL_ATTACHMENT_TYPES_LABEL =
  'Any document or image (no programs/scripts)';

function fileExtension(filename: string): string {
  const base = String(filename || '').trim().split(/[/\\]/).pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

export function guessEmailAttachmentContentType(filename: string, mimeHint = ''): string {
  const hint = (mimeHint || '').trim().toLowerCase();
  const ext = fileExtension(filename);
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (hint && hint !== 'application/octet-stream') return hint;
  return 'application/octet-stream';
}

function isSafeDocumentMime(mimeHint: string): boolean {
  const mime = (mimeHint || '').trim().toLowerCase().split(';')[0];
  if (!mime || mime === 'application/octet-stream') return false;
  if (mime.startsWith('image/')) return true;
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('application/msword')) return true;
  if (mime.startsWith('application/vnd.ms-')) return true;
  if (mime.startsWith('application/vnd.openxmlformats-officedocument.')) return true;
  if (mime.startsWith('application/vnd.oasis.opendocument.')) return true;
  if (mime.startsWith('application/vnd.apple.')) return true;
  if (mime === 'application/rtf' || mime === 'text/rtf') return true;
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return true;
  if (mime === 'application/json' || mime === 'application/xml' || mime === 'text/xml') return true;
  if (mime === 'message/rfc822') return true;
  if (mime === 'application/epub+zip') return true;
  return Object.values(MIME_BY_EXT).includes(mime);
}

export function isAllowedEmailAttachment(file: File): boolean {
  const name = String(file?.name || '').trim();
  if (!name || name.startsWith('.')) return false;
  const ext = fileExtension(name);
  if (ext && BLOCKED_EXT.has(ext)) return false;
  if (ext) return true;
  return isSafeDocumentMime(file.type || '');
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function fileToEmailAttachment(file: File): Promise<EmailAttachmentPayload> {
  if (!isAllowedEmailAttachment(file)) {
    throw new Error(`${file.name}: file type not allowed (${EMAIL_ATTACHMENT_TYPES_LABEL})`);
  }
  if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
    throw new Error(`${file.name}: max ${formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)} per file`);
  }
  const content = await readFileAsBase64(file);
  return {
    filename: file.name,
    contentType: guessEmailAttachmentContentType(file.name, file.type),
    content,
    size: file.size,
  };
}

export async function filesToEmailAttachments(files: File[]): Promise<EmailAttachmentPayload[]> {
  if (files.length > EMAIL_ATTACHMENT_MAX_COUNT) {
    throw new Error(`Maximum ${EMAIL_ATTACHMENT_MAX_COUNT} attachments`);
  }
  return Promise.all(files.map((file) => fileToEmailAttachment(file)));
}

export function stripAttachmentPayload(item: EmailAttachmentItem): EmailAttachmentPayload {
  const { filename, contentType, content, size } = item;
  return { filename, contentType, content, size };
}
