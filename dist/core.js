export const ROUND_COUNT = 5;
export const DIFFICULTY_LABELS = ['FAMILIAR GROUND', 'LESS FAMILIAR', 'HARD', 'VERY HARD', 'EXPERT'];
export function distanceMeters(a, b) {
  const r = Math.PI / 180;
  const s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, s)), Math.sqrt(Math.max(0, 1 - s)));
}
export function scoreForDistance(distance) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return distance <= 20 ? 5000 : Math.round(5000 * Math.exp(-(distance - 20) / 350));
}
export function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function selectRounds(locations, seen = [], count = ROUND_COUNT) {
  if (!Number.isInteger(count) || count < 1 || count > ROUND_COUNT) throw new Error('Invalid round count.');
  const seenIds = new Set(seen);
  const seenGroups = new Set(locations.filter(x => seenIds.has(x.id)).map(x => x.group));
  const familiarity = x => (seenIds.has(x.id) ? 2 : 0) + (seenGroups.has(x.group) ? 1 : 0);
  const pools = Array.from({ length: count }, (_, i) => shuffle(locations.filter(x => x.difficulty === i + 1)).sort((a, b) => familiarity(a) - familiarity(b)));
  const groups = new Set();
  const selected = [];
  function choose(index) {
    if (index === count) return true;
    for (const location of pools[index]) {
      if (groups.has(location.group)) continue;
      groups.add(location.group); selected.push(location);
      if (choose(index + 1)) return true;
      selected.pop(); groups.delete(location.group);
    }
    return false;
  }
  if (!choose(0)) throw new Error('Not enough distinct locations across increasing difficulty levels.');
  return selected;
}
