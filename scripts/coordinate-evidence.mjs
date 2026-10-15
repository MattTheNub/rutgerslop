import { distanceMeters } from '../dist/core.js';

// Commons distinguishes the camera's Location template from Object location.
// The latter must never become the answer to "where was this photo taken?".
export function cameraLocationFromTemplate(template) {
  const match = /^\{\{\s*(?:location(?: dec)?|camera location)\s*\|([^{}]*)\}\}$/i.exec(template.trim());
  if (!match) throw new Error('An explicit camera-location template is required.');
  const parts = match[1].split('|').map(x => x.trim());
  let lat, lng;
  if (parts.length >= 8 && /^[NS]$/i.test(parts[3]) && /^[EW]$/i.test(parts[7])) {
    const dms = (degrees, minutes, seconds, direction) => {
      const values = [degrees, minutes, seconds].map(Number);
      if (!values.every(Number.isFinite) || values.some(x => x < 0) || values[1] >= 60 || values[2] >= 60) throw new Error('Invalid DMS camera coordinates.');
      return (values[0] + values[1] / 60 + values[2] / 3600) * (/^[SW]$/i.test(direction) ? -1 : 1);
    };
    lat = dms(...parts.slice(0, 4)); lng = dms(...parts.slice(4, 8));
  } else {
    const read = value => {
      const raw = value?.replace(/^\d+\s*=\s*/, '');
      if (!raw || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new Error('Invalid decimal camera coordinates.');
      return Number(raw);
    };
    lat = read(parts[0]); lng = read(parts[1]);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Camera coordinates are out of range.');
  return { lat, lng };
}

export function verifiedCameraPosition(evidence) {
  if (!evidence || evidence.status !== 'accepted' || !evidence.revisionId || !evidence.source?.startsWith('https://commons.wikimedia.org/')) throw new Error('Missing accepted camera-coordinate evidence.');
  const template = cameraLocationFromTemplate(evidence.cameraTemplate);
  if (evidence.exif) {
    const { lat, lng } = evidence.exif;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Invalid EXIF GPS coordinates.');
    if (distanceMeters(template, evidence.exif) > 1) throw new Error('Camera template and original EXIF GPS disagree by more than one meter.');
    return { lat, lng };
  }
  return template;
}

export function validateCatalogCoordinates(catalog, evidence) {
  const errors = [];
  for (const location of catalog) {
    try {
      const record = evidence.locations[location.id];
      const expected = verifiedCameraPosition(record);
      if (location.source !== record.source) throw new Error('Photo source does not match the coordinate evidence.');
      if (location.lat !== expected.lat || location.lng !== expected.lng) throw new Error('Coordinates differ from the full-precision camera source.');
    } catch (error) { errors.push(`${location.id}: ${error.message}`); }
  }
  if (errors.length) throw new Error(`Coordinate audit failed:\n${errors.join('\n')}`);
}
