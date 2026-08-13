/**
 * Build AMC PDF as base64 for WhatsApp document send.
 * Same authenticity stamp + SHA-256 fingerprint as AMC email / download.
 */
import { toast } from 'sonner';
import type { Bill } from '@/types';
import { billToAmcPdfData, generateAMCHTML, type AMCPDFOptions } from '@/lib/amc-pdf-generator';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
  todayYmdIst,
} from '@/lib/documentPdfAuthenticity';
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
  const verifyCode =
    pdfOptions?.authenticityVerifyCode || generateDocumentPdfVerifyCode();
  const generatedOnYmd =
    pdfOptions?.authenticityGeneratedOnYmd || todayYmdIst();
  const html = generateAMCHTML(billToAmcPdfData(bill), {
    ...pdfOptions,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  });
  const pdf = await generateDocumentPdfBase64({ html, filename: pdfFilename });
  const recorded = await recordDocumentPdfAuthenticity({
    docType: 'amc',
    sourceKey: String(bill.billNumber || '').trim() || `amc-${Date.now()}`,
    verifyCode,
    pdfBase64: pdf.pdfBase64,
    filename: pdf.filename,
    customerId: bill.customer?.id || null,
    documentRef: bill.billNumber,
    generatedOnYmd,
  });
  if (!recorded.ok) {
    toast.warning('PDF generated, but authenticity fingerprint was not saved', {
      description: recorded.error,
    });
  }
  return pdf;
}
