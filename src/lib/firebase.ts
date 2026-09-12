import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/** Same Firebase project as Admin/Technician Android FCM (`hydrogenro-otp`). */
export const firebaseWebConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '449481461674') as string,
};

/**
 * Public Web Push certificate key (Firebase Console → Cloud Messaging).
 * Safe to ship in the client; prefer env / app_secrets, this is last-resort so
 * production PWAs work even when VITE_FIREBASE_VAPID_KEY was not baked into the build.
 */
export const FIREBASE_WEB_VAPID_PUBLIC_KEY =
  'BHlqV8rh0W58tfjnkviBYNl_9eVoumVBv_rLVBn7HJ3GlNCWXwlpN9lRwcucmYp581jDJSKcVzE9RHV6HyYkRmE';

/** True when Vite env has the minimum Firebase web config for Phone Auth / FCM web. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseWebConfig.apiKey &&
      firebaseWebConfig.authDomain &&
      firebaseWebConfig.projectId
  );
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseWebConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}
