/** Human label for WhatsApp document bubbles (inbox / composer). */
export function whatsappDocumentTypeLabel(
  filename?: string | null,
  mime?: string | null
): string {
  const name = String(filename || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.includes('pdf') || /\.pdf$/i.test(name)) return 'PDF';
  if (/\.docx$/i.test(name) || m.includes('wordprocessingml')) return 'DOCX';
  if (/\.doc$/i.test(name) || m === 'application/msword') return 'DOC';
  if (/\.xlsx$/i.test(name) || m.includes('spreadsheetml')) return 'XLSX';
  if (/\.xls$/i.test(name) || m.includes('ms-excel')) return 'XLS';
  if (/\.pptx$/i.test(name) || m.includes('presentationml')) return 'PPTX';
  if (/\.ppt$/i.test(name) || m.includes('ms-powerpoint')) return 'PPT';
  if (/\.txt$/i.test(name) || m === 'text/plain') return 'TXT';
  if (/\.csv$/i.test(name) || m === 'text/csv') return 'CSV';
  const ext = name.split('.').pop();
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)) return ext.toUpperCase();
  return 'Document';
}

export function isWhatsAppPdfAttachment(
  filename?: string | null,
  mime?: string | null,
  msgType?: string | null
): boolean {
  if (String(msgType || '').toLowerCase() === 'pdf') return true;
  const name = String(filename || '');
  const m = String(mime || '').toLowerCase();
  return m.includes('pdf') || /\.pdf$/i.test(name);
}
