/**
 * In-memory Auto Ask OTP debug log for the technician dashboard.
 * Lets us see near/far, dwell timer, and last server replies without adb logcat.
 */
export type AutoAskOtpDebugServerReply = {
  at: string;
  near: boolean;
  httpStatus: number;
  waiting?: boolean;
  remainingMs?: number;
  asked?: boolean;
  sent?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  dwellMs?: number;
  onsiteDetectedAt?: string;
  requestId?: string;
};

export type AutoAskOtpDebugJobRow = {
  jobId: string;
  jobNumber?: string;
  customerName?: string;
  status?: string;
  requireOtp: boolean;
  otpEntered: boolean;
  meters: number | null;
  nearLimitMeters: number;
  isNear: boolean | null;
  hasCustomerCoords: boolean;
  skipReason?: string;
  lastServer?: AutoAskOtpDebugServerReply;
};

export type AutoAskOtpDebugSnapshot = {
  updatedAt: string;
  locationTrackingEnabled: boolean;
  techLat: number | null;
  techLng: number | null;
  accuracyMeters: number | null;
  accuracyOk: boolean | null;
  nativePlatform: boolean;
  lastEvaluateAt: string | null;
  lastFlushAt: string | null;
  jobs: AutoAskOtpDebugJobRow[];
  recentLog: string[];
};

type Listener = (snap: AutoAskOtpDebugSnapshot) => void;

const MAX_LOG = 40;
const listeners = new Set<Listener>();

let snapshot: AutoAskOtpDebugSnapshot = {
  updatedAt: new Date().toISOString(),
  locationTrackingEnabled: true,
  techLat: null,
  techLng: null,
  accuracyMeters: null,
  accuracyOk: null,
  nativePlatform: false,
  lastEvaluateAt: null,
  lastFlushAt: null,
  jobs: [],
  recentLog: [],
};

function emit() {
  snapshot = { ...snapshot, updatedAt: new Date().toISOString() };
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      /* ignore */
    }
  }
}

function pushLog(line: string) {
  const stamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
  snapshot.recentLog = [`${stamp} ${line}`, ...snapshot.recentLog].slice(0, MAX_LOG);
}

export function subscribeAutoAskOtpDebug(fn: Listener): () => void {
  listeners.add(fn);
  fn(snapshot);
  return () => listeners.delete(fn);
}

export function getAutoAskOtpDebugSnapshot(): AutoAskOtpDebugSnapshot {
  return snapshot;
}

export function autoAskOtpDebugSetMeta(partial: Partial<AutoAskOtpDebugSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export function autoAskOtpDebugSetJobs(jobs: AutoAskOtpDebugJobRow[]) {
  snapshot.jobs = jobs;
  emit();
}

export function autoAskOtpDebugMarkEvaluate() {
  snapshot.lastEvaluateAt = new Date().toISOString();
  emit();
}

export function autoAskOtpDebugMarkFlush() {
  snapshot.lastFlushAt = new Date().toISOString();
  emit();
}

export function autoAskOtpDebugLog(line: string) {
  pushLog(line);
  emit();
}

export function autoAskOtpDebugServerReply(jobId: string, reply: AutoAskOtpDebugServerReply) {
  snapshot.jobs = snapshot.jobs.map((j) =>
    j.jobId === jobId ? { ...j, lastServer: reply } : j
  );
  const bits = [
    reply.near ? 'near' : 'check',
    `HTTP ${reply.httpStatus}`,
    reply.waiting ? `waiting ${Math.ceil((reply.remainingMs || 0) / 1000)}s` : null,
    reply.asked ? `asked sent=${reply.sent}` : null,
    reply.skipped ? `skip:${reply.reason}` : null,
    reply.error || null,
  ].filter(Boolean);
  pushLog(`${jobId.slice(0, 8)}… ${bits.join(' · ')}`);
  emit();
}

export function formatRemaining(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
