/// <reference types="astro/client" />

type D1Database = import("@cloudflare/workers-types").D1Database;

type Runtime = import("@astrojs/cloudflare").Runtime<{
  DB: D1Database;
  ADMIN_PASSWORD: string;
  RESEND_API_KEY: string;
  SITE_URL: string;
  NEWSLETTER_FROM: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
