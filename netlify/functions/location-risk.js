/**
 * Technician location risk check.
 *
 * The phone can tell us that Android marked a fix as mock. That flag is a
 * signal from the real app, not proof: a modified app can omit it, and a
 * rooted phone can hide it. This module recomputes the decision from the
 * coordinates, timestamps, and (when the real app sent it) the mock bit.
 * Client-supplied risk scores are ignored.
 *
 * Play Integrity is intentionally not called. A passing verdict does not
 * prove the GPS fix is genuine, and a failing one does not prove it is fake.
 * There is no Play Integrity dependency or Cloud project number in this app.
 * `integrityRisk` exists so a future server-side check can add a capped
 * signal. Callers must not pass a value that came from the phone.
 *
 * Thresholds are the configuration. Keep them aligned with
 * LocationRiskEvaluator.java. Poor accuracy, a VPN, or a missing fix is not
 * treated as spoofing. One bad reading is rejected for the map only — nobody
 * is banned.
 */

const DEFAULTS = {
  rejectScore: 70,
  elevatedScore: 40,
  highScore: 55,
  confirmedScore: 80,
  maxSpeedMps: 55, // 198 km/h — above highway, train, and GPS jitter
  minJumpMeters: 1500,
  shortWindowMs: 15_000,
  shortWindowJumpMeters: 3000,
  accuracyPaddingFactor: 3,
  missingAccuracyMeters: 100,
  futureSoftMs: 2 * 60 * 1000,
  futureSoftScore: 40,
  mockScore: 80,
  impossibleSpeedScore: 70,
  zeroAccuracyScore: 10,
  reportedSpeedMps: 70,
  reportedSpeedMaxAccuracyM: 40,
  reportedSpeedScore: 25,
  timestampConflictScore: 40,
  accuracySwingScore: 10,
  accuracySwingTightM: 25,
  accuracySwingLooseM: 3000,
  providerDisagreeMeters: 2000,
  providerDisagreeWindowMs: 2 * 60 * 1000,
  providerDisagreeScore: 20,
  integrityScoreCap: 25,
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidCoord(latitude, longitude) {
  return (
    isFiniteNumber(latitude) &&
    isFiniteNumber(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

function accuracyMetersOf(sample, cfg) {
  if (!sample || !isFiniteNumber(sample.accuracyMeters) || sample.accuracyMeters < 0) {
    return cfg.missingAccuracyMeters;
  }
  return sample.accuracyMeters;
}

function paddingMeters(a, b, cfg) {
  return cfg.accuracyPaddingFactor * (accuracyMetersOf(a, cfg) + accuracyMetersOf(b, cfg));
}

function hasTime(sample) {
  return !!sample && isFiniteNumber(sample.fixTimeMs) && sample.fixTimeMs > 0;
}

function levelFor(score, mock, cfg) {
  if (mock || score >= cfg.confirmedScore) return 'confirmed';
  if (score >= cfg.highScore) return 'high';
  if (score >= cfg.elevatedScore) return 'elevated';
  return 'none';
}

function result({ mock, score, reasons, usable, nowMs }) {
  const capped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    isMockLocation: mock === true,
    riskScore: capped,
    riskLevel: levelFor(capped, mock === true, DEFAULTS),
    reasons,
    locationUsable: usable === true && mock !== true && capped < DEFAULTS.rejectScore,
    checkedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * @param {{
 *   location?: {
 *     latitude: number,
 *     longitude: number,
 *     accuracyMeters?: number | null,
 *     fixTimeMs?: number | null,
 *     reportedSpeedMps?: number | null,
 *     mock?: boolean,
 *     provider?: string | null,
 *   } | null,
 *   previous?: object | null,
 *   other?: object | null,
 *   nowMs?: number,
 *   integrityRisk?: number,
 * }} input
 */
function assessLocation(input) {
  const cfg = DEFAULTS;
  const nowMs = isFiniteNumber(input?.nowMs) ? input.nowMs : Date.now();
  const loc = input?.location;
  if (!loc) {
    return result({
      mock: false,
      score: 0,
      reasons: ['location_unavailable'],
      usable: false,
      nowMs,
    });
  }

  const reasons = [];
  let score = 0;
  let mock = loc.mock === true;
  if (mock) {
    reasons.push('mock_provider');
    score += cfg.mockScore;
  }

  if (!isValidCoord(loc.latitude, loc.longitude)) {
    reasons.push('invalid_coordinates');
    return result({ mock, score, reasons, usable: false, nowMs });
  }

  if (hasTime(loc)) {
    const ahead = loc.fixTimeMs - nowMs;
    if (ahead > cfg.futureSoftMs) {
      reasons.push('future_timestamp');
      score += cfg.futureSoftScore;
    }
  }

  const accuracyKnown = isFiniteNumber(loc.accuracyMeters) && loc.accuracyMeters >= 0;
  if (
    isFiniteNumber(loc.reportedSpeedMps) &&
    loc.reportedSpeedMps > cfg.reportedSpeedMps &&
    accuracyKnown &&
    loc.accuracyMeters <= cfg.reportedSpeedMaxAccuracyM
  ) {
    reasons.push('reported_speed');
    score += cfg.reportedSpeedScore;
  }

  if (loc.accuracyMeters === 0) {
    reasons.push('zero_accuracy');
    score += cfg.zeroAccuracyScore;
  }

  const prev = input?.previous;
  if (prev && isValidCoord(prev.latitude, prev.longitude)) {
    const dist = distanceMeters(loc.latitude, loc.longitude, prev.latitude, prev.longitude);
    const floor = paddingMeters(loc, prev, cfg);
    const bothTimes = hasTime(loc) && hasTime(prev);
    if (bothTimes && loc.fixTimeMs === prev.fixTimeMs && dist > Math.max(cfg.minJumpMeters, floor)) {
      reasons.push('timestamp_conflict');
      score += cfg.timestampConflictScore;
    } else if (bothTimes && loc.fixTimeMs !== prev.fixTimeMs) {
      const dt = Math.abs(loc.fixTimeMs - prev.fixTimeMs);
      const shortJump = dt < cfg.shortWindowMs && dist > Math.max(cfg.shortWindowJumpMeters, floor);
      const pacedJump =
        dt >= cfg.shortWindowMs &&
        dt > 0 &&
        dist > Math.max(cfg.minJumpMeters, floor) &&
        dist / (dt / 1000) > cfg.maxSpeedMps;
      if (shortJump || pacedJump) {
        reasons.push('impossible_speed');
        score += cfg.impossibleSpeedScore;
      }
    }

    if (!reasons.includes('impossible_speed') && !reasons.includes('timestamp_conflict')) {
      const moved = dist > Math.max(cfg.minJumpMeters, floor);
      const prevAcc = prev.accuracyMeters;
      const nextAcc = loc.accuracyMeters;
      if (
        moved &&
        isFiniteNumber(prevAcc) &&
        isFiniteNumber(nextAcc) &&
        prevAcc > 0 &&
        prevAcc < cfg.accuracySwingTightM &&
        nextAcc > cfg.accuracySwingLooseM
      ) {
        reasons.push('accuracy_swing');
        score += cfg.accuracySwingScore;
      }
    }
  }

  const other = input?.other;
  if (
    other &&
    other.provider &&
    loc.provider &&
    other.provider !== loc.provider &&
    isValidCoord(other.latitude, other.longitude)
  ) {
    const dist = distanceMeters(loc.latitude, loc.longitude, other.latitude, other.longitude);
    const floor = paddingMeters(loc, other, cfg);
    let timesClose = true;
    if (hasTime(loc) && hasTime(other)) {
      timesClose = Math.abs(loc.fixTimeMs - other.fixTimeMs) <= cfg.providerDisagreeWindowMs;
    }
    if (timesClose && dist > Math.max(cfg.providerDisagreeMeters, floor)) {
      reasons.push('provider_disagreement');
      score += cfg.providerDisagreeScore;
    }
  }

  // Server-side only. Capped so integrity alone cannot reject a fix.
  if (isFiniteNumber(input?.integrityRisk) && input.integrityRisk > 0) {
    reasons.push('device_integrity');
    score += Math.min(cfg.integrityScoreCap, input.integrityRisk);
  }

  const usable = score < cfg.rejectScore;
  return result({ mock, score, reasons, usable, nowMs });
}

function previousFromRow(row) {
  if (!row) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!isValidCoord(latitude, longitude)) return null;
  const accuracy = row.accuracy == null ? null : Number(row.accuracy);
  const fix = Date.parse(row.fix_time || '');
  const updated = Date.parse(row.updated_at || '');
  const fixTimeMs = Number.isFinite(fix) && fix > 0 ? fix : Number.isFinite(updated) ? updated : null;
  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    fixTimeMs,
  };
}

/**
 * Decide what the upload handler may write. Ignores body.riskScore,
 * body.reasons, and body.integrityRisk — those are client-controlled.
 */
function decideLocationWrite(body, previous, nowMs) {
  const now = isFiniteNumber(nowMs) ? nowMs : Date.now();
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
  const fixTime = Number(body?.fixTime);
  const speed = body?.speed == null ? null : Number(body.speed);
  const assessment = assessLocation({
    nowMs: now,
    previous,
    location: {
      latitude,
      longitude,
      accuracyMeters: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
      fixTimeMs: Number.isFinite(fixTime) && fixTime > 0 ? fixTime : null,
      reportedSpeedMps: Number.isFinite(speed) && speed >= 0 ? speed : null,
      mock: body?.mockReported === true,
    },
  });
  const checkedAt = assessment.checkedAt;
  const riskPatch = {
    location_mock: assessment.isMockLocation,
    location_risk_score: assessment.riskScore,
    location_risk_level: assessment.riskLevel,
    location_risk_reasons: assessment.reasons.join(','),
    location_risk_checked_at: checkedAt,
    updated_at: checkedAt,
  };
  if (!assessment.locationUsable) {
    return { assessment, accepted: false, coordinatePatch: null, riskPatch, fixIso: null };
  }
  const fixIso = Number.isFinite(fixTime) && fixTime > 0 ? new Date(fixTime).toISOString() : null;
  return {
    assessment,
    accepted: true,
    fixIso,
    riskPatch,
    coordinatePatch: {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
      ...(fixIso ? { fix_time: fixIso } : {}),
      ...riskPatch,
    },
  };
}

function isMissingRiskColumn(error) {
  const msg = String(error?.message || '');
  return /column/i.test(msg) && /schema cache|does not exist/i.test(msg);
}

module.exports = {
  DEFAULTS,
  assessLocation,
  decideLocationWrite,
  previousFromRow,
  isMissingRiskColumn,
  distanceMeters,
};
