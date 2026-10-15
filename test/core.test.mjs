import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { distanceMeters, scoreForDistance, formatDistance, selectRounds, ROUND_COUNT } from '../dist/core.js';
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const playable = JSON.parse(readFileSync(new URL('../dist/locations.json', import.meta.url)));
test('distance uses the Earth, not screen pixels; symmetric and correct at campus scale', () => {
  const point = { lat: 40.5, lng: -74.45 };
  assert.equal(distanceMeters(point, point), 0);
  const north = { lat: 40.501, lng: -74.45 };
  assert.ok(Math.abs(distanceMeters(point, north) - 111.195) < .1);
  assert.equal(distanceMeters(point, north), distanceMeters(north, point));
  assert.ok(Number.isFinite(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })));
});
test('hard scoring: exact guesses and 20 m get 5000, distance reduces points, invalid distances never score', () => {
  assert.equal(scoreForDistance(0), 5000);
  assert.equal(scoreForDistance(20), 5000);
  assert.ok(scoreForDistance(100) < 4000);
  assert.ok(scoreForDistance(1000) < 350);
  assert.equal(scoreForDistance(Infinity), 0);
  assert.equal(scoreForDistance(NaN), 0);
  assert.equal(scoreForDistance(-1), 0);
  let previous = 5000;
  for (let distance = 0; distance < 15000; distance += 10) {
    const score = scoreForDistance(distance);
    assert.ok(score >= 0 && score <= previous); previous = score;
  }
});
test('games get strictly harder over five different places, across 5000 randomized draws', () => {
  for (let i = 0; i < 5000; i++) {
    const rounds = selectRounds(playable);
    assert.equal(rounds.length, ROUND_COUNT);
    assert.equal(new Set(rounds.map(x => x.group)).size, ROUND_COUNT);
    assert.equal(new Set(rounds.map(x => x.id)).size, ROUND_COUNT);
    assert.deepEqual(rounds.map(x => x.difficulty), [1, 2, 3, 4, 5]);
  }
});
test('recent photos are avoided, and a fully seen catalog still produces a game', () => {
  const seen = selectRounds(playable).map(x => x.id);
  assert.ok(selectRounds(playable, seen).every(x => !seen.includes(x.id)));
  assert.equal(selectRounds(playable, playable.map(x => x.id)).length, ROUND_COUNT);
  assert.throws(() => selectRounds(playable.slice(0, 1)), /Not enough/);
});
test('selection backtracks instead of repeating a building or breaking the difficulty ramp', () => {
  const choices = [{ id: 'a1', group: 'a', difficulty: 1 }, { id: 'b1', group: 'b', difficulty: 1 }, ...[2, 3, 4, 5].map(difficulty => ({ id: `a${difficulty}`, group: difficulty === 2 ? 'a' : `group${difficulty}`, difficulty }))];
  for (let i = 0; i < 100; i++) assert.equal(selectRounds(choices)[0].id, 'b1');
  assert.throws(() => selectRounds(choices.filter(x => x.difficulty !== 4)), /increasing difficulty/);
  for (const count of [0, 6, 1.5]) assert.throws(() => selectRounds(choices, [], count), /round count/);
});
test('new places take priority over alternate photos of recently revealed buildings', () => {
  const choices = Array.from({ length: 5 }, (_, i) => [
    { id: `seen-${i}`, group: `known-${i}`, difficulty: i + 1 },
    { id: `alternate-${i}`, group: `known-${i}`, difficulty: i + 1 },
    { id: `new-${i}`, group: `fresh-${i}`, difficulty: i + 1 }
  ]).flat();
  assert.ok(selectRounds(choices, choices.filter(x => x.id.startsWith('seen')).map(x => x.id)).every(x => x.id.startsWith('new')));
});
test('catalog contains at least 60 locations with camera GPS, sources and licenses', () => {
  assert.ok(new Set(catalog.map(x => x.group)).size >= 60);
  assert.ok(catalog.length >= 150);
  assert.equal(new Set(catalog.map(x => x.id)).size, catalog.length);
  for (const location of catalog) {
    assert.ok(location.lat > 40.47 && location.lat < 40.535);
    assert.ok(location.lng > -74.481 && location.lng < -74.419);
    assert.ok(location.source.startsWith('https://commons.wikimedia.org/'));
    assert.ok(location.license && location.artist && location.description);
  }
});
test('distance display keeps campus distances readable', () => {
  assert.equal(formatDistance(19.8), '20 m');
  assert.equal(formatDistance(1532), '1.53 km');
});
