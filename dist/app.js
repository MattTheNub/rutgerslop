import { ROUND_COUNT, DIFFICULTY_LABELS, distanceMeters, scoreForDistance, formatDistance, selectRounds, shuffle } from './core.js';
import { createPinIcon } from './map-pins.js';
import { preparePhotoFrame } from './photo-frame.js';

const $ = id => document.getElementById(id);
const number = n => n.toLocaleString('en-US');
const CATALOG_VERSION = 4;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing still supports a complete game. */ } }
};
const ANNOUNCE = text => { $('announcement').textContent = text; };
let locations = [], game, map, marker, answerMarker, answerLine, imageReady = false, mapReady = false;
let loadVersion = 0, photoScale = 1, photoOffset = { x: 0, y: 0 }, dragging;
let displayedPhoto;
const campusBounds = [[40.4705, -74.4805], [40.535, -74.419]];
const activeLocation = () => locations.find(x => x.id === game.rounds[game.index]);
const totalScore = () => game.results.reduce((sum, result) => sum + result.score, 0);
const save = () => storage.set('rgg2-game-v1', game);
const bestScore = () => storage.get('rgg2-best-v1', 0);

function setupMap() {
  map = L.map('map', { zoomControl: true, minZoom: 12, maxZoom: 19, maxBounds: [[40.44, -74.53], [40.57, -74.38]], maxBoundsViscosity: .85, scrollWheelZoom: true, attributionControl: true });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' });
  tiles.on('tileload', () => {
    mapReady = true;
    $('map-error').hidden = true;
    syncGuessControls();
  });
  tiles.on('tileerror', () => { if (!mapReady) $('map-error').hidden = false; });
  tiles.addTo(map);
  $('retry-map').onclick = () => tiles.redraw();
  map.fitBounds(campusBounds, { padding: [12, 12] });
  map.on('click', e => placePin(e.latlng));
  $('recenter-map').onclick = () => map.fitBounds(campusBounds, { padding: [12, 12] });
  $('center-pin').onclick = () => placePin(map.getCenter());
}

function pinIcon(answer = false) {
  return createPinIcon(L, answer);
}

function placePin(latlng) {
  if (game.phase !== 'guessing' || !imageReady || !mapReady) return;
  const guess = { lat: latlng.lat, lng: latlng.lng };
  game.guess = guess;
  if (marker) marker.setLatLng(guess);
  else marker = L.marker(guess, { icon: pinIcon(), draggable: true, autoPan: true, keyboard: true, title: 'Your guess. Drag to move.' }).addTo(map).on('dragend', () => {
    const point = marker.getLatLng();
    if (game.phase === 'guessing') { game.guess = { lat: point.lat, lng: point.lng }; save(); }
  });
  $('submit-guess').disabled = false;
  $('submit-label').textContent = 'LOCK IN YOUR GUESS';
  $('guess-status').lastElementChild.textContent = 'Pin placed. Feeling confident?';
  ANNOUNCE('Guess placed. Move the pin or lock in your guess.');
  save();
}

function clearMap() {
  for (const layer of [marker, answerMarker, answerLine]) if (layer) map.removeLayer(layer);
  marker = answerMarker = answerLine = null;
  map.invalidateSize();
  map.fitBounds(campusBounds, { padding: [12, 12], animate: false });
}

function renderProgress() {
  $('round-track').replaceChildren(...Array.from({ length: ROUND_COUNT }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = `round-dot${i === game.index ? ' active' : ''}${i < game.results.length ? ' done' : ''}`;
    dot.textContent = i < game.results.length ? '✓' : String(i + 1).padStart(2, '0');
    dot.setAttribute('aria-label', `Round ${i + 1}${i < game.results.length ? ' complete' : i === game.index ? ' current' : ''}`);
    return dot;
  }));
}

function resetPhoto() {
  photoScale = 1;
  photoOffset = { x: 0, y: 0 };
  transformPhoto();
}
function transformPhoto() {
  const scene = $('scene');
  const maxX = scene.clientWidth * (photoScale - 1) / 2;
  const maxY = scene.clientHeight * (photoScale - 1) / 2;
  photoOffset.x = Math.min(maxX, Math.max(-maxX, photoOffset.x));
  photoOffset.y = Math.min(maxY, Math.max(-maxY, photoOffset.y));
  $('scene-photo').style.transform = `translate(${photoOffset.x}px,${photoOffset.y}px) scale(${photoScale})`;
  $('photo-zoom-label').textContent = `${photoScale}×`;
  $('photo-zoom-out').disabled = photoScale <= 1;
  $('photo-zoom-in').disabled = photoScale >= 3;
}

async function loadPhoto() {
  const version = ++loadVersion;
  imageReady = false;
  const photo = $('scene-photo');
  photo.style.opacity = '0';
  $('image-loading').hidden = false;
  $('image-error').hidden = true;
  $('submit-guess').disabled = true;
  $('center-pin').disabled = true;
  const location = activeLocation();
  let prepared;
  try {
    prepared = await preparePhotoFrame(location.image, location.frame);
    if (version !== loadVersion) { prepared.release(); return; }
    photo.src = prepared.src;
    await photo.decode();
    if (version !== loadVersion) { prepared.release(); return; }
    displayedPhoto?.release();
    displayedPhoto = prepared;
    imageReady = true;
    photo.style.opacity = '1';
    $('image-loading').hidden = true;
    if (game.phase === 'guessing') {
      syncGuessControls();
    } else if (game.phase === 'reveal') renderReveal();
    const next = locations.find(x => x.id === game.rounds[game.index + 1]);
    if (next) { const prefetch = new Image(); prefetch.src = next.image; }
  } catch {
    prepared?.release();
    if (version !== loadVersion) return;
    $('image-loading').hidden = true;
    $('image-error').hidden = false;
  }
}

function renderRound() {
  $('game').hidden = false;
  $('results').hidden = true;
  $('round-number').innerHTML = `${String(game.index + 1).padStart(2, '0')} <small>/ 05</small>`;
  $('total-score').innerHTML = `${number(totalScore())} <small>pts</small>`;
  $('scene-badge').textContent = `LOCATION ${String(game.index + 1).padStart(2, '0')}`;
  $('difficulty-label').textContent = DIFFICULTY_LABELS[activeLocation().difficulty - 1];
  $('scene-heading').innerHTML = 'Looks familiar.<br>But where?';
  $('photo-credit').textContent = `Photo: ${activeLocation().artist} · ${activeLocation().license} · Selected view · Original after reveal`;
  $('map-instruction').innerHTML = 'Explore the map. Drop a pin where<br>you think this photo was taken.';
  $('submit-label').textContent = 'PLACE A PIN TO GUESS';
  $('guess-status').lastElementChild.textContent = 'One campus. A thousand possibilities.';
  $('bottom-tip').innerHTML = '<span>↳</span> The obvious answer isn’t always the right one.';
  clearMap();
  resetPhoto();
  renderProgress();
  loadPhoto();
}

function startGame() {
  const seen = storage.get('rgg2-seen-v1', []);
  const rounds = selectRounds(locations, seen);
  game = { catalogVersion: CATALOG_VERSION, rounds: rounds.map(x => x.id), index: 0, results: [], phase: 'guessing', guess: null };
  storage.set('rgg2-seen-v1', [...seen, ...game.rounds].slice(-Math.floor(locations.length * .8)));
  save();
  renderRound();
  ANNOUNCE('New game. Each round gets harder. Round 1 of 5. Take your time and lock in when you are ready.');
}

function submitGuess() {
  if (game.phase !== 'guessing' || !imageReady || !mapReady || !game.guess) return;
  const location = activeLocation();
  const distance = distanceMeters(game.guess, location);
  game.results.push({ id: location.id, guess: game.guess, distance, score: scoreForDistance(distance) });
  game.phase = 'reveal';
  save();
  renderReveal();
}

function sourceLink(location) {
  const a = document.createElement('a');
  a.href = location.source;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = `Photo: ${location.artist} · ${location.license} ↗`;
  return a;
}

function renderReveal() {
  const location = activeLocation();
  const result = game.results[game.index];
  if (!result) return;
  if (marker) marker.dragging.disable();
  if (!answerMarker) {
    answerMarker = L.marker(location, { icon: pinIcon(true), title: location.name }).addTo(map).bindTooltip('Camera position', { permanent: true, direction: 'top', className: 'map-label' });
    if (result.guess) {
      if (!marker) marker = L.marker(result.guess, { icon: pinIcon(), title: 'Your guess' }).addTo(map);
      marker.bindTooltip('Your guess', { className: 'map-label' });
      answerLine = L.polyline([result.guess, location], { color: '#cc2639', weight: 2, dashArray: '5 6' }).addTo(map);
      map.fitBounds(L.latLngBounds([result.guess, location]), { padding: [45, 45], maxZoom: 17 });
    } else map.setView(location, 16);
  }
  $('scene-heading').textContent = location.name;
  $('scene-badge').textContent = 'LOCATION REVEALED';
  $('photo-credit').replaceChildren(sourceLink(location));
  $('map-instruction').textContent = result.distance <= 20 ? 'Right on the spot. Perfect round.' : `You were ${formatDistance(result.distance)} from the camera.`;
  $('guess-status').lastElementChild.textContent = `+${number(result.score)} points · ${location.campus}`;
  $('submit-label').textContent = game.index === ROUND_COUNT - 1 ? 'SEE YOUR RESULTS' : 'NEXT LOCATION';
  $('submit-guess').disabled = false;
  $('center-pin').disabled = true;
  $('total-score').innerHTML = `${number(totalScore())} <small>pts</small>`;
  $('bottom-tip').textContent = result.score >= 4500 ? 'You definitely know a shortcut or two.' : 'Put this corner of campus in your memory.';
  renderProgress();
  ANNOUNCE(`${location.name}. ${formatDistance(result.distance)} away. ${number(result.score)} points.`);
}

function advance() {
  if (game.phase === 'guessing') {
    submitGuess();
    return;
  }
  if (game.phase !== 'reveal') return;
  if (game.index === ROUND_COUNT - 1) { game.phase = 'complete'; save(); renderResults(); }
  else { game.index++; game.phase = 'guessing'; game.guess = null; save(); renderRound(); }
}

function syncGuessControls() {
  const canGuess = game?.phase === 'guessing' && imageReady && mapReady;
  $('center-pin').disabled = !canGuess;
  if (canGuess && game.guess && !marker) placePin(game.guess);
  $('submit-guess').disabled = game?.phase === 'reveal' ? !imageReady : !(canGuess && game.guess);
}

function updateBest() {
  const best = bestScore();
  if (best > 0) {
    $('best-score').textContent = `Personal best: ${number(best)} points.`;
    $('best-caption').textContent = 'Your high score, saved on this device.';
  }
}

function renderResults() {
  $('game').hidden = true;
  $('results').hidden = false;
  const score = totalScore();
  if (score > bestScore()) storage.set('rgg2-best-v1', score);
  updateBest();
  $('final-score').textContent = number(score);
  $('results-title').textContent = score >= 20000 ? 'Certified campus legend.' : score >= 12000 ? 'You’ve been around.' : score >= 5000 ? 'Getting your bearings.' : 'Take the scenic route.';
  $('result-description').textContent = score >= 20000 ? 'You know the corners the campus tour leaves out.' : 'There’s always another corner of Rutgers to discover. Ready for five more?';
  $('result-rows').replaceChildren(...game.results.map((result, index) => {
    const location = locations.find(x => x.id === result.id);
    const row = document.createElement('div'); row.className = 'result-row';
    const n = document.createElement('span'); n.textContent = String(index + 1).padStart(2, '0');
    const img = document.createElement('img'); img.src = location.image; img.alt = location.name;
    const name = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = location.name;
    const small = document.createElement('small'); small.textContent = location.campus; name.append(strong, small);
    const distance = document.createElement('span'); distance.className = 'row-distance'; distance.textContent = formatDistance(result.distance);
    const points = document.createElement('span'); points.className = 'row-score'; points.textContent = number(result.score);
    row.append(n, img, name, distance, points); return row;
  }));
  $('share-status').textContent = '';
  ANNOUNCE(`Game complete. ${number(score)} out of 25,000 points.`);
}

function replacePhoto() {
  const usedGroups = new Set(game.rounds.map(id => locations.find(x => x.id === id)?.group));
  const replacement = shuffle(locations).find(x => x.difficulty === game.index + 1 && !usedGroups.has(x.group));
  if (!replacement) { ANNOUNCE('No alternate photo is available. Try loading this photo again.'); return; }
  game.rounds[game.index] = replacement.id;
  game.guess = null; save(); renderRound();
}

function showCredits() {
  const played = game.results.map(x => locations.find(l => l.id === x.id));
  $('credits-list').replaceChildren();
  if (!played.length) {
    const note = document.createElement('p'); note.textContent = 'Complete a round to see its original photo, photographer, and license.'; $('credits-list').append(note);
  }
  for (const location of played) {
    const item = document.createElement('div'); item.className = 'credit-item';
    const title = document.createElement('strong'); title.textContent = location.name;
    item.append(title, sourceLink(location));
    if (location.licenseUrl) { const a = document.createElement('a'); a.href = location.licenseUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' · License terms ↗'; item.append(a); }
    $('credits-list').append(item);
  }
  $('credits-dialog').showModal();
}

async function shareResults() {
  const text = `Rutgers GeoGuessr 2\n${number(totalScore())} / 25,000\n${game.results.map(r => `${r.score >= 4500 ? '🟥' : r.score >= 2500 ? '🟧' : r.score >= 1000 ? '🟨' : '⬜'} ${number(r.score)} pts · ${formatDistance(r.distance)}`).join('\n')}\nFive rounds. No shortcuts.`;
  try { await navigator.clipboard.writeText(text); $('share-status').textContent = 'Results copied. Send them to your campus group chat.'; }
  catch {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('aria-label', 'Your results. Select and copy to share.'); area.style.cssText = 'width:100%;height:160px;margin-top:15px';
    $('share-status').replaceChildren(area); area.focus(); area.select();
  }
}

function wireEvents() {
  $('submit-guess').onclick = advance;
  $('retry-photo').onclick = loadPhoto;
  $('replace-photo').onclick = replacePhoto;
  $('help-open').onclick = () => $('help-dialog').showModal();
  $('credits-open').onclick = showCredits;
  $('new-game').onclick = () => $('restart-dialog').showModal();
  $('confirm-restart').onclick = () => { $('restart-dialog').close(); startGame(); };
  $('play-again').onclick = () => { startGame(); $('game').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('share-results').onclick = shareResults;
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } }));
  $('photo-zoom-in').onclick = () => { photoScale = Math.min(3, photoScale + .5); transformPhoto(); };
  $('photo-zoom-out').onclick = () => { photoScale = Math.max(1, photoScale - .5); transformPhoto(); };
  $('photo-fullscreen').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('scene').requestFullscreen(); }
    catch { ANNOUNCE('Fullscreen is unavailable in this browser. Use the photo zoom controls to look closer.'); }
  };
  const photo = $('scene-photo');
  photo.addEventListener('pointerdown', e => { if (photoScale <= 1) return; dragging = { x: e.clientX - photoOffset.x, y: e.clientY - photoOffset.y }; photo.setPointerCapture(e.pointerId); });
  photo.addEventListener('pointermove', e => { if (!dragging) return; photoOffset = { x: e.clientX - dragging.x, y: e.clientY - dragging.y }; transformPhoto(); });
  photo.addEventListener('pointerup', () => { dragging = null; });
  photo.addEventListener('pointercancel', () => { dragging = null; });
  document.addEventListener('fullscreenchange', resetPhoto);
  window.addEventListener('resize', () => { map?.invalidateSize(); transformPhoto(); });
}

function isValidSavedGame(saved) {
  const ids = new Set(locations.map(x => x.id));
  if (!Array.isArray(saved?.rounds) || !saved.rounds.every((id, i) => locations.find(x => x.id === id)?.difficulty === i + 1) || new Set(saved.rounds.map(id => locations.find(x => x.id === id)?.group)).size !== ROUND_COUNT) return false;
  return saved && saved.catalogVersion === CATALOG_VERSION && Array.isArray(saved.rounds) && saved.rounds.length === ROUND_COUNT && saved.rounds.every(id => ids.has(id)) && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < ROUND_COUNT && ['guessing', 'reveal', 'complete'].includes(saved.phase) && Array.isArray(saved.results) && saved.results.length === (saved.phase === 'guessing' ? saved.index : saved.index + 1) && saved.results.every((r, i) => r.id === saved.rounds[i] && Number.isFinite(r.score) && r.score >= 0 && r.score <= 5000 && Number.isFinite(r.distance) && r.distance >= 0 && Number.isFinite(r.guess?.lat) && Number.isFinite(r.guess?.lng)) && (saved.phase !== 'complete' || saved.results.length === ROUND_COUNT) && (!saved.guess || (Number.isFinite(saved.guess.lat) && Number.isFinite(saved.guess.lng)));
}

async function init() {
  try {
    const response = await fetch('./locations.json');
    if (!response.ok) throw new Error('The location catalog could not load.');
    locations = await response.json();
    if (!Array.isArray(locations) || locations.length < ROUND_COUNT) throw new Error('The location catalog is incomplete.');
    if (!window.L) throw new Error('The local map library could not load.');
    const spotCount = new Set(locations.map(x => x.group)).size;
    $('location-count').textContent = `${spotCount} locations. ${locations.length} ways to get lost.`;
    setupMap(); wireEvents(); updateBest();
    const saved = storage.get('rgg2-game-v1', null);
    if (isValidSavedGame(saved)) { game = saved; if (game.phase === 'complete') renderResults(); else renderRound(); }
    else startGame();
  } catch (error) {
    $('image-loading').hidden = true;
    $('image-error').hidden = false;
    $('image-error').querySelector('strong').textContent = 'The game couldn’t start.';
    $('image-error').querySelector('p').textContent = error.message;
    $('replace-photo').hidden = true;
    $('retry-photo').onclick = () => window.location.reload();
  }
}
init();
