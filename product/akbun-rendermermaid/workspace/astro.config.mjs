import { defineConfig } from 'astro/config';

// Static output is the default. Mermaid is bundled by the build, so the page
// needs nothing at runtime beyond the assets Cloudflare serves.
export default defineConfig({});
