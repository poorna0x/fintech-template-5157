const assert = require('node:assert/strict');
const {
  jobAlertTag,
  androidUrgentPush,
  androidOsJobNotification,
  techChannelForJobEvent,
} = require('../netlify/functions/tech-fcm-channels');
const {
  isStaleTokenError,
  isTransientFcmError,
  sendFcmWithRetry,
} = require('../netlify/functions/push-prefs-helper');

{
  assert.equal(techChannelForJobEvent('assigned'), 'job_alerts_v2');
  assert.equal(techChannelForJobEvent('reassigned'), 'job_alerts_v2');
  assert.equal(techChannelForJobEvent('unassigned'), 'tech_general_v1');
}

{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const channels = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/NotificationChannels.java'),
    'utf8'
  );
  const otp = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/OtpReplyReceiver.java'),
    'utf8'
  );
  assert.match(channels, /OTP_ALERTS = "otp_alerts_v1"/);
  assert.match(channels, /"alertringtone"/);
  assert.match(otp, /CHANNEL_ID = NotificationChannels\.OTP_ALERTS/);
  assert.match(otp, /RESULT_CHANNEL_ID = NotificationChannels\.GENERAL_ALERTS/);
  assert.match(channels, /NUDGE_SOUND = "nudge_sound_v1"/);
  assert.match(channels, /"nudgetech"/);
  const messaging = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/hydrogenro/technician/HroMessagingService.java'),
    'utf8'
  );
  const send = fs.readFileSync(path.join(root, 'netlify/functions/send-tech-push.js'), 'utf8');
  assert.match(messaging, /"nudge_sound"/);
  assert.match(messaging, /NotificationChannels\.NUDGE_SOUND/);
  assert.match(send, /soundOnly/);
  assert.match(send, /type: 'nudge_sound'/);
  assert.equal(
    fs.existsSync(path.join(root, 'android/app/src/main/res/raw/nudgetech.wav')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(root, 'android/app/src/main/res/raw/alertringtone.wav')),
    true
  );
}

{
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  assert.equal(jobAlertTag('assigned', id), `job_alert_assigned_${id}`);
  assert.notEqual(
    jobAlertTag('assigned', 'job-one'),
    jobAlertTag('assigned', 'job-two'),
    'two jobs must not share a collapse tag'
  );
  assert.equal(jobAlertTag('assigned', id, 'custom_tag'), 'custom_tag');
  assert.equal(jobAlertTag('assigned', ''), 'job_alert_assigned');
}

{
  const android = androidUrgentPush({ collapseKey: 'os_x' });
  assert.equal(android.priority, 'high');
  assert.equal(android.ttl, 60 * 60 * 1000);
  assert.equal(android.directBootOk, true);
  assert.equal(android.collapseKey, 'os_x');
}

{
  const os = androidOsJobNotification({
    channelId: 'job_alerts_v2',
    tag: 'job_alert_assigned_abc',
    color: '#16A34A',
  });
  assert.equal(os.priority, 'high');
  assert.equal(os.notification.channelId, 'job_alerts_v2');
  assert.equal(os.notification.notificationPriority, 'PRIORITY_MAX');
  assert.equal(os.notification.defaultVibrateTimings, true);
}

{
  const stale = { errorInfo: { code: 'messaging/registration-token-not-registered' } };
  assert.equal(isStaleTokenError(stale), true);
  assert.equal(isTransientFcmError(stale), false);

  const blip = { errorInfo: { code: 'messaging/server-unavailable' } };
  assert.equal(isTransientFcmError(blip), true);
  assert.equal(isStaleTokenError(blip), false);

  const timeout = { message: 'ETIMEDOUT connecting to fcm' };
  assert.equal(isTransientFcmError(timeout), true);
}

(async () => {
  let calls = 0;
  const retryOk = await sendFcmWithRetry(
    {
      async send() {
        calls += 1;
        if (calls === 1) {
          const err = new Error('unavailable');
          err.errorInfo = { code: 'messaging/server-unavailable' };
          throw err;
        }
      },
    },
    { token: 'x' },
    0
  );
  assert.equal(retryOk.ok, true);
  assert.equal(retryOk.retried, true);
  assert.equal(calls, 2);

  const staleOut = await sendFcmWithRetry(
    {
      async send() {
        const err = new Error('gone');
        err.errorInfo = { code: 'messaging/registration-token-not-registered' };
        throw err;
      },
    },
    { token: 'x' },
    0
  );
  assert.equal(staleOut.ok, false);
  assert.equal(staleOut.stale, true);

  console.log('tech-fcm-android.test.cjs ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
