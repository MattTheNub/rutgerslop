import { readFile } from 'node:fs/promises';
import { validateCatalogCoordinates } from './coordinate-evidence.mjs';
import { reviewedPhotos, validatePlayableReview } from './photo-review.mjs';

const evidence = JSON.parse(await readFile('data/coordinate-evidence.json', 'utf8'));
const source = JSON.parse(await readFile('data/catalog.json', 'utf8'));
const client = JSON.parse(await readFile('dist/locations.json', 'utf8'));
validateCatalogCoordinates(source, evidence);
validateCatalogCoordinates(client, evidence);
const review = JSON.parse(await readFile('data/photo-review.json', 'utf8'));
validatePlayableReview(client, await reviewedPhotos(source, review));
const active = new Set(source.map(x => x.id));
const rejected = Object.entries(evidence.locations).filter(([, record]) => record.status === 'excluded');
if (rejected.some(([id]) => active.has(id))) throw new Error('An excluded photo is still playable.');
console.log(`Coordinate audit passed: ${client.length} playable photos match their full-precision camera evidence; ${rejected.length} uncertain or object-only pins excluded.`);
