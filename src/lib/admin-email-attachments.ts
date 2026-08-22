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

/** Office + common docs; browsers often omit MIME for these — also match by extension. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
};

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|gif|docx?|xlsx?|pptx?|txt|csv|rtf|odt)$/i;

export const EMAIL_ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,application/pdf,image/jpeg,image/png,image/webp,image/gif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/rtf,application/vnd.oasis.opendocument.text';

export const EMAIL_ATTACHMENT_TYPES_LABEL =
  'PDF, Word, Excel, PowerPoint, images, TXT, CSV, RTF, ODT';

export function guessEmailAttachmentContentType(filename: string, mimeHint = ''): string {
  const hint = (mimeHint || '').trim().toLowerCase();
  if (hint && hint !== 'application/octet-stream' && ALLOWED_MIME.has(hint)) {
    return hint;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || hint || 'application/octet-stream';
}

export function isAllowedEmailAttachment(file: File): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime && ALLOWED_MIME.has(mime)) return true;
  return ALLOWED_EXT.test(file.name);
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
