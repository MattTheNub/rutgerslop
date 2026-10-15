import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { frameBounds } from '../dist/photo-frame.js';
import { selectRounds } from '../dist/core.js';

export async function reviewedPhotos(source, review) {
  const approved = [];
  for (const location of source) {
    const decision = review.photos[location.id];
    if (!decision || !['approved', 'excluded'].includes(decision.status) || !decision.reason) throw new Error(`Photo ${location.id} needs a visual difficulty review.`);
    if (decision.status === 'excluded') continue;
    if (!Array.isArray(decision.frame)) throw new Error(`Photo ${location.id} needs an explicit reviewed frame.`);
    if (!Number.isInteger(decision.difficulty) || decision.difficulty < 1 || decision.difficulty > 5 || !decision.difficultyReason) throw new Error(`Photo ${location.id} needs a reviewed difficulty level and reason.`);
    frameBounds(10000, 10000, decision.frame);
    const digest = createHash('sha256').update(await readFile('dist/' + location.image)).digest('hex');
    if (digest !== decision.sha256) throw new Error(`Photo ${location.id} changed and must be reviewed again.`);
    approved.push({ ...location, frame: decision.frame, difficulty: decision.difficulty });
  }
  if (new Set(approved.map(x => x.group)).size < 5) throw new Error('At least five distinct reviewed locations are required.');
  selectRounds(approved);
  return approved;
}

export function validatePlayableReview(client, approved) {
  if (client.length !== approved.length || client.some((x, i) => x.id !== approved[i].id || x.image !== approved[i].image || x.difficulty !== approved[i].difficulty || JSON.stringify(x.frame) !== JSON.stringify(approved[i].frame))) throw new Error('Playable photos, difficulty levels and frames do not match their visual review. Rebuild the catalog.');
}
