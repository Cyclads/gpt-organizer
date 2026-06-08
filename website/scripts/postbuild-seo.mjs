import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');
const base =
  (process.env.VITE_SITE_URL ?? 'https://benedyktdryl.github.io/gpt-organizer').replace(/\/$/, '');

mkdirSync(dist, { recursive: true });

const robots = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

writeFileSync(join(dist, 'robots.txt'), robots);
writeFileSync(join(dist, 'sitemap.xml'), sitemap);
writeFileSync(join(dist, '.nojekyll'), '');
console.info('Wrote robots.txt, sitemap.xml, .nojekyll for', base);
