// The visible SVG tip is exactly (12, 32), which is also Leaflet's anchor.
// Both answer and guess markers share this geometry at every zoom level.
export const PIN_ANCHOR = Object.freeze([12, 32]);
export const PIN_SIZE = Object.freeze([24, 32]);
export function createPinIcon(leaflet, answer = false) {
  return leaflet.divIcon({
    className: `guess-marker${answer ? ' answer-marker' : ''}`,
    html: '<svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true"><path fill="white" d="M12 0C5.373 0 0 5.373 0 12c0 8 12 20 12 20s12-12 12-20C24 5.373 18.627 0 12 0Z"/><path fill="currentColor" d="M12 3a9 9 0 0 0-9 9c0 5.5 9 16 9 16s9-10.5 9-16a9 9 0 0 0-9-9Z"/><circle fill="white" cx="12" cy="12" r="3"/></svg>',
    iconSize: [...PIN_SIZE],
    iconAnchor: [...PIN_ANCHOR],
    tooltipAnchor: [0, -32]
  });
}
