/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_WHATSAPP_NUMBER: string;
  readonly PUBLIC_YOUTUBE_VSL_ID: string;
  readonly PUBLIC_META_PIXEL_ID: string;
  readonly PUBLIC_GOOGLE_ADS_ID: string;
  readonly PUBLIC_DAYUSE_PAYMENT_URL: string;
  readonly PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL: string;
}

interface Window {
  __utms: Record<string, string | null>;
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}
