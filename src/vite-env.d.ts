/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_EMAIL_API_URL: string
  readonly VITE_EMAIL_FROM: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string
  readonly VITE_CLOUDINARY_API_KEY?: string
  /** Public booking intent: 'hydrogenro' | 'elevenro' — defaults per app if unset */
  readonly VITE_WEBSITE_BOOKING_SITE_KEY?: 'hydrogenro' | 'elevenro'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
