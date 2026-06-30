export function buildTechnicianChangeRequestNote(params: {
  technicianName: string;
  field: 'name' | 'phone';
  currentValue: string;
  proposedValue: string;
  reason?: string;
  jobNumber?: string;
}): string {
  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const fieldLabel = params.field === 'name' ? 'Name' : 'Primary phone';
  const lines = [
    `[TECH CHANGE REQUEST · ${ts}]`,
    `Technician: ${params.technicianName}`,
    params.jobNumber ? `Job: ${params.jobNumber}` : null,
    `${fieldLabel}: "${params.currentValue}" → "${params.proposedValue}"`,
    params.reason?.trim() ? `Reason: ${params.reason.trim()}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export function appendCustomerNote(existing: string | null | undefined, addition: string): string {
  const prev = (existing ?? '').trim();
  return prev ? `${prev}\n\n${addition}` : addition;
}

export function hasPendingTechnicianChangeRequest(notes: string | null | undefined): boolean {
  return String(notes || '').includes('[TECH CHANGE REQUEST');
}

/** Split notes into technician change-request blocks for admin display. */
export function listTechnicianChangeRequests(notes: string | null | undefined): string[] {
  const text = String(notes || '').trim();
  if (!text.includes('[TECH CHANGE REQUEST')) return [];
  const parts = text.split(/\n\n(?=\[TECH CHANGE REQUEST)/);
  return parts.map((p) => p.trim()).filter((p) => p.startsWith('[TECH CHANGE REQUEST'));
}
