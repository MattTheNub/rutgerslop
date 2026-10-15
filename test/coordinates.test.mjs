import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cameraLocationFromTemplate, verifiedCameraPosition, validateCatalogCoordinates } from '../scripts/coordinate-evidence.mjs';
import { distanceMeters, scoreForDistance } from '../dist/core.js';
import { createPinIcon, PIN_ANCHOR, PIN_SIZE } from '../dist/map-pins.js';
const read = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url)));
const evidence = read('data/coordinate-evidence.json');
const source = read('data/catalog.json');
const client = read('dist/locations.json');

test('all playable coordinates exactly match their retained camera evidence and source photo', () => {
  validateCatalogCoordinates(source, evidence);
  validateCatalogCoordinates(client, evidence);
  assert.ok(client.every(x => source.some(y => y.id === x.id)));
  for (const target of client) {
    const expected = verifiedCameraPosition(evidence.locations[target.id]);
    assert.equal(distanceMeters(expected, target), 0);
    assert.equal(scoreForDistance(distanceMeters(expected, target)), 5000);
  }
});

test('object-only and suspect locations cannot re-enter the playable catalog', () => {
  const ids = new Set(client.map(x => x.id));
  const excluded = Object.entries(evidence.locations).filter(([, x]) => x.status === 'excluded');
  assert.equal(excluded.length, 11);
  for (const [id, entry] of excluded) {
    assert.ok(!ids.has(id), `${id} must stay excluded`);
    assert.throws(() => verifiedCameraPosition(entry), /evidence/);
    assert.ok(entry.reason);
  }
  assert.throws(() => cameraLocationFromTemplate('{{Object location dec|40.5|-74.45}}'), /camera-location/);
});

test('decimal and DMS camera coordinates retain full precision and hemisphere signs', () => {
  assert.deepEqual(cameraLocationFromTemplate('{{Location|40.478663149614874|-74.43192336891272}}'), { lat: 40.478663149614874, lng: -74.43192336891272 });
  assert.deepEqual(cameraLocationFromTemplate('{{Location dec|40.513166666667|-74.437666666667|heading:164.8}}'), { lat: 40.513166666667, lng: -74.437666666667 });
  assert.deepEqual(cameraLocationFromTemplate('{{location|40|30|48.93|N|74|27|51.00|W|type:landmark}}'), { lat: 40 + 30 / 60 + 48.93 / 3600, lng: -(74 + 27 / 60 + 51 / 3600) });
  assert.deepEqual(cameraLocationFromTemplate('{{Location|40|31.44|0|N|74|28.25|0|W}}'), { lat: 40.524, lng: -(74 + 28.25 / 60) });
  assert.deepEqual(cameraLocationFromTemplate('{{Location|1=40.5|2=-74.45}}'), { lat: 40.5, lng: -74.45 });
  for (const text of ['{{Location||-74}}', '{{Location|NaN|-74}}', '{{Location|91|-74}}', '{{Location|40|60|0|N|74|0|0|W}}']) assert.throws(() => cameraLocationFromTemplate(text));
});

test('rounding, swapped axes, mismatched sources and conflicting EXIF fail the audit', () => {
  const precise = source.find(x => x.lat !== Number(x.lat.toFixed(6)));
  assert.ok(precise);
  assert.throws(() => validateCatalogCoordinates([{ ...precise, lat: Number(precise.lat.toFixed(6)) }], evidence), /full-precision/);
  assert.throws(() => validateCatalogCoordinates([{ ...precise, lat: precise.lng, lng: precise.lat }], evidence), /full-precision/);
  assert.throws(() => validateCatalogCoordinates([{ ...precise, source: source.find(x => x.id !== precise.id).source }], evidence), /source/);
  const proof = evidence.locations[precise.id];
  assert.throws(() => verifiedCameraPosition({ ...proof, exif: { lat: precise.lat + .01, lng: precise.lng } }), /disagree/);
});

test('guess and answer pin tips share the exact anchor used by Leaflet', () => {
  const leaflet = { divIcon: options => options };
  assert.deepEqual(PIN_SIZE, [24, 32]);
  assert.deepEqual(PIN_ANCHOR, [12, 32]);
  for (const answer of [false, true]) {
    const icon = createPinIcon(leaflet, answer);
    assert.deepEqual(icon.iconAnchor, [12, 32]);
    assert.deepEqual(icon.iconSize, [24, 32]);
    assert.match(icon.html, /viewBox="0 0 24 32"/);
  }
});
