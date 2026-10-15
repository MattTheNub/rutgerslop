import { readFile, stat } from 'node:fs/promises';
import { validateCatalogCoordinates } from './coordinate-evidence.mjs';
import { reviewedPhotos, validatePlayableReview } from './photo-review.mjs';
const files = ['index.html', 'style.css', 'app.js', 'core.js', 'map-pins.js', 'photo-frame.js', 'locations.json', 'vendor/leaflet.js', 'vendor/leaflet.css', 'assets/display.ttf', 'assets/body.ttf', 'assets/body-bold.ttf'];
const catalog = JSON.parse(await readFile('dist/locations.json', 'utf8'));
const sourceCatalog = JSON.parse(await readFile('data/catalog.json', 'utf8'));
const evidence = JSON.parse(await readFile('data/coordinate-evidence.json', 'utf8'));
validateCatalogCoordinates(catalog, evidence);
validateCatalogCoordinates(sourceCatalog, evidence);
const review = JSON.parse(await readFile('data/photo-review.json', 'utf8'));
validatePlayableReview(catalog, await reviewedPhotos(sourceCatalog, review));
await Promise.all([...files, ...catalog.map(x => x.image)].map(async file => {
  const info = await stat('dist/' + file);
  if (!info.size) throw new Error(`Empty asset: ${file}`);
}));
console.log(`Build verified: ${catalog.length} local photos, ${new Set(catalog.map(x => x.group)).size} locations. Serve dist/ with any static web server.`);
