import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameBounds } from '../dist/photo-frame.js';
import { reviewedPhotos, validatePlayableReview } from '../scripts/photo-review.mjs';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const source = read('data/catalog.json');
const review = read('data/photo-review.json');
const client = read('dist/locations.json');

test('playable photos match the reviewed image hashes and exact selected frames', async () => {
  const approved = await reviewedPhotos(source, review);
  validatePlayableReview(client, approved);
  assert.equal(approved.length, 74);
  assert.equal(new Set(approved.map(x => x.group)).size, 56);
  const ids = new Set(approved.map(x => x.id));
  for (const id of ['105875256', '105875257', '147766289']) assert.ok(!ids.has(id), 'Named Cook Student Center fronts must stay excluded');
  assert.ok(ids.has('105875254'), 'Unmarked rear view remains available');
  for (const id of ['147766252', '112481100', '105875425']) assert.ok(ids.has(id), 'Horse pasture, Honors courtyard and Wood Lawn views stay available');
  for (const tier of [1, 2, 3, 4, 5]) assert.ok(approved.filter(x => x.difficulty === tier).length >= 5, 'Every round needs a varied difficulty pool');
  const expanded = structuredClone(client);
  expanded.find(x => x.frame[2] < 1).frame = [0, 0, 1, 1];
  assert.throws(() => validatePlayableReview(expanded, approved), /visual review/);
  const rerated = structuredClone(client); rerated[0].difficulty = 5;
  assert.throws(() => validatePlayableReview(rerated, approved), /visual review/);
});

test('unreviewed and changed photos cannot enter a build', async () => {
  const missing = structuredClone(review);
  delete missing.photos[source[0].id];
  await assert.rejects(reviewedPhotos(source, missing), /visual difficulty review/);
  const changed = structuredClone(review);
  changed.photos[source[0].id].sha256 = 'incorrect';
  await assert.rejects(reviewedPhotos(source, changed), /changed and must be reviewed again/);
  const unrated = structuredClone(review);
  delete unrated.photos[source[0].id].difficulty;
  await assert.rejects(reviewedPhotos(source, unrated), /difficulty level/);
});

test('framing uses bounded source pixels and rejects empty or out-of-range views', () => {
  assert.deepEqual(frameBounds(1200, 900, [.47, .16, .53, .84]), { x: 564, y: 144, width: 636, height: 756 });
  assert.deepEqual(frameBounds(1200, 900), { x: 0, y: 0, width: 1200, height: 900 });
  for (const frame of [[0, 0, 0, 1], [-.1, 0, 1, 1], [.5, 0, 1, 1], [0, 0, NaN, 1], [0, 0, .00001, 1]]) assert.throws(() => frameBounds(1200, 900, frame));
});
