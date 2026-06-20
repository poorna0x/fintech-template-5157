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

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|gif)$/i;

export function isAllowedEmailAttachment(file: File): boolean {
  if (ALLOWED_MIME.has(file.type)) return true;
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
    throw new Error(`${file.name}: only PDF and image files are allowed`);
  }
  if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
    throw new Error(`${file.name}: max ${formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)} per file`);
  }
  const content = await readFileAsBase64(file);
  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
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
