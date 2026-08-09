/**
 * Build AMC PDF as base64 for WhatsApp document send (hash-only authenticity fingerprint).
 */
import type { Bill } from '@/types';
import { billToAmcPdfData, generateAMCHTML, type AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
  todayYmdIst,
} from '@/lib/documentPdfAuthenticity';

export async function generateAmcPdfBase64ForWhatsApp(
  bill: Bill,
  pdfOptions?: AMCPDFOptions
): Promise<{ pdfBase64: string; filename: string; size: number }> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  const verifyCode =
    pdfOptions?.authenticityVerifyCode || generateDocumentPdfVerifyCode();
  const generatedOnYmd =
    pdfOptions?.authenticityGeneratedOnYmd || todayYmdIst();
  const authPdfOptions: AMCPDFOptions = {
    ...pdfOptions,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const pdfFilename = `AMC_${bill.billNumber.replace(/\s+/g, '_')}.pdf`;
  const html = generateAMCHTML(billToAmcPdfData(bill), authPdfOptions);
  const pdf = await generateDocumentPdfBase64({ html, filename: pdfFilename });
  await recordDocumentPdfAuthenticity({
    docType: 'amc',
    sourceKey: String(bill.billNumber || '').trim() || `amc-${Date.now()}`,
    verifyCode,
    pdfBase64: pdf.pdfBase64,
    filename: pdf.filename,
    customerId: bill.customer?.id || null,
    documentRef: bill.billNumber,
    generatedOnYmd,
  });
  return pdf;
}
