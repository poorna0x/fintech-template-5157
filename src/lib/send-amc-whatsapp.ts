/**
 * Build AMC PDF as base64 for WhatsApp document send.
 */
import type { Bill } from '@/types';
import { billToAmcPdfData, generateAMCHTML, type AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';

export async function generateAmcPdfBase64ForWhatsApp(
  bill: Bill,
  pdfOptions?: AMCPDFOptions
): Promise<{ pdfBase64: string; filename: string; size: number }> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  const pdfFilename = `AMC_${bill.billNumber.replace(/\s+/g, '_')}.pdf`;
  const html = generateAMCHTML(billToAmcPdfData(bill), pdfOptions);
  return generateDocumentPdfBase64({ html, filename: pdfFilename });
}
