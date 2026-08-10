import { defineConfig } from 'astro/config';

// Static output is the default. The catalog is fetched in the browser, so the
// page needs nothing at runtime beyond the assets Cloudflare serves.
export default defineConfig({});
