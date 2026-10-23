const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assessLocation,
  decideLocationWrite,
  isMissingRiskColumn,
} = require('../netlify/functions/location-risk');

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const HERE = { latitude: 12.9716, longitude: 77.5946, accuracyMeters: 15, fixTimeMs: NOW - 60_000 };

function at(lat, lng, fixTimeMs, extra = {}) {
  return {
    latitude: lat,
    longitude: lng,
    accuracyMeters: 15,
    fixTimeMs,
    mock: false,
    ...extra,
  };
}

{
  const genuine = assessLocation({
    nowMs: NOW,
    previous: HERE,
    location: at(12.98, 77.6, NOW),
  });
  assert.equal(genuine.isMockLocation, false);
  assert.equal(genuine.locationUsable, true);
  assert.equal(genuine.riskLevel, 'none');
  assert.equal(genuine.riskScore, 0);
  assert.equal(genuine.checkedAt, '2026-10-23T12:00:00.000Z');
}

{
  const mock = assessLocation({
    nowMs: NOW,
    previous: HERE,
    location: at(12.9716, 77.5946, NOW, { mock: true }),
  });
  assert.equal(mock.isMockLocation, true);
  assert.equal(mock.locationUsable, false);
  assert.equal(mock.riskLevel, 'confirmed');
  assert.ok(mock.reasons.includes('mock_provider'));
  assert.ok(mock.riskScore >= 80);
}

{
  const poor = assessLocation({
    nowMs: NOW,
    previous: HERE,
    location: at(12.9716, 77.5946, NOW, { accuracyMeters: 8000 }),
  });
  assert.equal(poor.locationUsable, true);
  assert.equal(poor.isMockLocation, false);
  assert.equal(poor.riskScore, 0);
}

{
  const missing = assessLocation({ nowMs: NOW, location: null });
  assert.equal(missing.locationUsable, false);
  assert.equal(missing.isMockLocation, false);
  assert.deepEqual(missing.reasons, ['location_unavailable']);
  assert.equal(missing.riskScore, 0);
}

{
  const stale = assessLocation({
    nowMs: NOW,
    previous: { ...HERE, fixTimeMs: NOW - 6 * 60 * 60 * 1000 },
    location: at(12.9716, 77.5946, NOW - 6 * 60 * 60 * 1000 + 60_000),
  });
  assert.equal(stale.locationUsable, true);
  assert.equal(stale.riskScore, 0);
  assert.equal(stale.reasons.includes('impossible_speed'), false);
}

{
  const teleport = assessLocation({
    nowMs: NOW,
    previous: HERE,
    location: at(13.15, 77.5946, NOW),
  });
  assert.equal(teleport.locationUsable, false);
  assert.equal(teleport.isMockLocation, false);
  assert.ok(teleport.reasons.includes('impossible_speed'));
}

{
  const commute = assessLocation({
    nowMs: NOW,
    previous: { ...HERE, fixTimeMs: NOW - 30 * 60 * 1000 },
    location: at(13.15, 77.5946, NOW),
  });
  assert.equal(commute.locationUsable, true);
  assert.equal(commute.reasons.includes('impossible_speed'), false);
}

{
  const jitter = assessLocation({
    nowMs: NOW,
    previous: { ...HERE, fixTimeMs: NOW - 3_000 },
    location: at(12.9788, 77.5946, NOW),
  });
  assert.equal(jitter.locationUsable, true, 'sub-kilometre GPS snap is not spoofing');
}

{
  const noisy = assessLocation({
    nowMs: NOW,
    previous: { ...HERE, accuracyMeters: 5000, fixTimeMs: NOW - 20_000 },
    location: at(13.06, 77.5946, NOW, { accuracyMeters: 5000 }),
  });
  assert.equal(noisy.locationUsable, true, 'a jump inside the accuracy bubble is kept');
}

{
  const future = assessLocation({
    nowMs: NOW,
    location: at(12.9716, 77.5946, NOW + 5 * 60 * 1000),
  });
  assert.equal(future.locationUsable, true);
  assert.equal(future.riskLevel, 'elevated');
  assert.ok(future.reasons.includes('future_timestamp'));
}

{
  const sameStamp = assessLocation({
    nowMs: NOW,
    previous: HERE,
    location: at(12.9716, 77.5946, HERE.fixTimeMs),
  });
  assert.equal(sameStamp.locationUsable, true);
  assert.equal(sameStamp.reasons.includes('timestamp_conflict'), false);
}

{
  const providers = assessLocation({
    nowMs: NOW,
    location: at(12.9716, 77.5946, NOW, { provider: 'gps' }),
    other: at(13.02, 77.5946, NOW, { provider: 'network', accuracyMeters: 30 }),
  });
  assert.equal(providers.locationUsable, true);
  assert.ok(providers.reasons.includes('provider_disagreement'));
  assert.ok(providers.riskScore < 70);
}

{
  const integrity = assessLocation({
    nowMs: NOW,
    location: at(12.9716, 77.5946, NOW),
    integrityRisk: 100,
  });
  assert.equal(integrity.locationUsable, true);
  assert.ok(integrity.reasons.includes('device_integrity'));
  assert.ok(integrity.riskScore <= 25);
}

{
  const hidden = assessLocation({
    nowMs: NOW,
    previous: { ...HERE, fixTimeMs: NOW - 10 * 60 * 1000 },
    location: at(12.99, 77.61, NOW, { mock: false }),
  });
  assert.equal(hidden.locationUsable, true);
  assert.equal(hidden.isMockLocation, false);
}

{
  const decision = decideLocationWrite(
    {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 12,
      fixTime: NOW,
      mockReported: true,
      riskScore: 0,
      reasons: ['trusted'],
      integrityRisk: 0,
    },
    HERE,
    NOW
  );
  assert.equal(decision.accepted, false);
  assert.equal(decision.assessment.isMockLocation, true);
  assert.equal(decision.coordinatePatch, null);
  assert.equal(decision.riskPatch.location_mock, true);
  assert.equal(decision.riskPatch.location_risk_reasons.includes('trusted'), false);
}

{
  const trustedClientScore = decideLocationWrite(
    {
      latitude: 12.98,
      longitude: 77.6,
      accuracy: 20,
      fixTime: NOW,
      riskScore: 100,
      integrityRisk: 100,
      mockReported: false,
    },
    HERE,
    NOW
  );
  assert.equal(trustedClientScore.accepted, true);
  assert.equal(trustedClientScore.assessment.riskScore, 0);
  assert.equal(trustedClientScore.coordinatePatch.location_mock, false);
}

{
  assert.equal(
    isMissingRiskColumn({ message: "Could not find the 'location_mock' column of 'technician_live_locations' in the schema cache" }),
    true
  );
  assert.equal(isMissingRiskColumn({ message: 'permission denied' }), false);
}

{
  const root = path.join(__dirname, '..');
  const upload = fs.readFileSync(path.join(root, 'netlify/functions/upload-tech-location.js'), 'utf8');
  const uploader = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/LocationUploader.java'),
    'utf8'
  );
  const store = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/LocalGpsStore.java'),
    'utf8'
  );
  const signals = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/MockLocationSignals.java'),
    'utf8'
  );
  assert.match(upload, /decideLocationWrite/);
  const uploadCode = upload.replace(/\/\/.*$/gm, '');
  assert.equal(uploadCode.includes('body.riskScore'), false);
  assert.equal(uploadCode.includes('body.integrityRisk'), false);
  assert.match(uploader, /mockReported/);
  assert.match(uploader, /LocationRiskGate\.evaluate/);
  assert.match(store, /LocationRiskGate\.evaluate/);
  assert.match(store, /locationUsable/);
  assert.match(signals, /location\.isMock\(\)/);
  assert.match(signals, /isFromMockProvider\(\)/);
  assert.match(signals, /SDK_INT >= 31/);

  const adminPlugin = fs.readFileSync(
    path.join(root, 'android-admin/app/src/main/java/com/hydrogenro/admin/LocationRiskPlugin.java'),
    'utf8'
  );
  const adminSignals = fs.readFileSync(
    path.join(root, 'android-admin/app/src/main/java/com/hydrogenro/admin/MockLocationSignals.java'),
    'utf8'
  );
  const adminMain = fs.readFileSync(
    path.join(root, 'android-admin/app/src/main/java/com/hydrogenro/admin/MainActivity.java'),
    'utf8'
  );
  const geo = fs.readFileSync(path.join(root, 'src/lib/geolocation.ts'), 'utf8');
  assert.match(adminPlugin, /assessCurrent/);
  assert.match(adminPlugin, /LocationRiskEvaluator\.assess/);
  assert.match(adminSignals, /location\.isMock\(\)/);
  assert.match(adminSignals, /isFromMockProvider\(\)/);
  assert.match(adminMain, /registerPlugin\(LocationRiskPlugin\.class\)/);
  assert.match(geo, /assertNativeLocationUsable/);
  assert.match(geo, /location_unavailable/);
}

console.log('location-risk tests passed');
