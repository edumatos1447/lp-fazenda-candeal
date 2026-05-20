/// <reference types="astro/client" />

interface Window {
  __utms: Record<string, string | null>;
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}
