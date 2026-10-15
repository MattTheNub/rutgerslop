// Optional browser QA. Pass --playwright=/absolute/path/to/playwright/index.mjs
// and run a Chromium CDP instance on 127.0.0.1:9222 before invoking.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const modulePath = process.argv.find(x => x.startsWith('--playwright='))?.slice(13) || 'playwright';
const { chromium } = await import(modulePath);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const origin = process.env.TEST_URL || 'http://127.0.0.1:3000';
const ready = async () => { await page.waitForFunction(() => document.getElementById('image-loading').hidden && document.getElementById('image-error').hidden && !!document.querySelector('.leaflet-tile-loaded')); };
try {
  await page.clock.install();
  await page.goto(origin);
  await ready();
  assert.equal(await page.locator('#timer').count(), 0);
  await page.clock.fastForward(86400000);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).phase), 'guessing', 'A day passing must not submit a round');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).results.length), 0);
  assert.equal(await page.locator('h1').textContent(), 'Know your way around?');
  assert.equal(await page.locator('#submit-guess').isDisabled(), true);
  assert.ok(await page.locator('.leaflet-tile-loaded').count() > 0, 'Real map tiles must load');
  assert.equal(await page.locator('#scene-photo').evaluate(img => img.naturalWidth > 0), true);
  const assertRamp = async (target = page) => assert.deepEqual(await target.evaluate(async () => {
    const catalog = await (await fetch('./locations.json')).json();
    return JSON.parse(localStorage.getItem('rgg2-game-v1')).rounds.map(id => catalog.find(x => x.id === id).difficulty);
  }), [1, 2, 3, 4, 5]);
  await assertRamp();
  assert.equal(await page.locator('#difficulty-label').textContent(), 'FAMILIAR GROUND');
  // Exercise real Leaflet projection and the production SVG icon for every pin.
  // This isolated map has no tile layer and makes no external map requests.
  const projectionAudit = await page.evaluate(async () => {
    const { createPinIcon, PIN_ANCHOR } = await import('./map-pins.js');
    const targets = await (await fetch('./locations.json')).json();
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:300px';
    document.body.append(div);
    const auditMap = L.map(div, { zoomControl: false, attributionControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    let checked = 0, maxPixelError = 0;
    for (const zoom of [12, 15, 19]) for (const target of targets) {
      auditMap.setView({ lat: target.lat + .00015, lng: target.lng - .00015 }, zoom, { animate: false });
      for (const answer of [false, true]) {
        const marker = L.marker(target, { icon: createPinIcon(L, answer) }).addTo(auditMap);
        const bounds = marker.getElement().querySelector('svg').getBoundingClientRect();
        const origin = div.getBoundingClientRect();
        const point = auditMap.latLngToContainerPoint(target);
        const error = Math.hypot(bounds.left + PIN_ANCHOR[0] - origin.left - point.x, bounds.top + PIN_ANCHOR[1] - origin.top - point.y);
        maxPixelError = Math.max(maxPixelError, error);
        if (marker.getLatLng().lat !== target.lat || marker.getLatLng().lng !== target.lng) throw new Error(`Marker changed source coordinates: ${target.id}`);
        marker.remove(); checked++;
      }
    }
    auditMap.remove(); div.remove();
    return { checked, expected: targets.length * 6, maxPixelError };
  });
  assert.equal(projectionAudit.checked, projectionAudit.expected);
  assert.ok(projectionAudit.maxPixelError <= 1, `Pin tip missed projected coordinates by ${projectionAudit.maxPixelError}px`);
  const frameAudit = await page.evaluate(async () => {
    const { preparePhotoFrame, frameBounds } = await import('./photo-frame.js');
    const targets = await (await fetch('./locations.json')).json();
    let cropped = 0;
    for (const target of targets) {
      const original = new Image(); original.src = target.image; await original.decode();
      const bounds = frameBounds(original.naturalWidth, original.naturalHeight, target.frame);
      const frame = await preparePhotoFrame(target.image, target.frame);
      const displayed = new Image(); displayed.src = frame.src; await displayed.decode();
      if (displayed.naturalWidth !== bounds.width || displayed.naturalHeight !== bounds.height) throw new Error(`Photo escaped its reviewed frame: ${target.id}`);
      if (target.frame.some((v, i) => v !== [0, 0, 1, 1][i])) {
        if (!frame.src.startsWith('blob:')) throw new Error('Cropped views must use their own pixel buffer');
        cropped++;
      }
      frame.release();
    }
    return { total: targets.length, cropped };
  });
  assert.equal(frameAudit.total, 74); assert.equal(frameAudit.cropped, 38);
  await page.evaluate(async () => {
    const catalog = await (await fetch('./locations.json')).json();
    const target = catalog.find(x => x.id === '193984347');
    const chosen = [target], groups = new Set([target.group]);
    for (let difficulty = 2; difficulty <= 5; difficulty++) {
      const item = catalog.find(x => x.difficulty === difficulty && !groups.has(x.group));
      chosen.push(item); groups.add(item.group);
    }
    const game = JSON.parse(localStorage.getItem('rgg2-game-v1'));
    game.rounds = chosen.map(x => x.id);
    localStorage.setItem('rgg2-game-v1', JSON.stringify(game));
  });
  await page.reload(); await ready();
  const reviewedView = await page.locator('#scene-photo').evaluate(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight }));
  assert.ok(reviewedView.src.startsWith('blob:'), 'The actual scene must use its reviewed crop');
  await mkdir('test-artifacts', { recursive: true });
  await page.screenshot({ path: 'test-artifacts/desktop.png', fullPage: true });
  await page.locator('#photo-zoom-in').click();
  assert.equal(await page.locator('#photo-zoom-label').textContent(), '1.5×');
  await page.locator('#photo-zoom-out').click();
  await page.locator('#photo-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'scene');
  assert.deepEqual(await page.locator('#scene-photo').evaluate(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight })), reviewedView, 'Fullscreen must retain the same cropped pixels');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.locator('#help-open').click();
  assert.equal(await page.locator('#help-dialog').evaluate(x => x.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-dialog').evaluate(x => x.open), false);
  await page.locator('#center-pin').click();
  assert.equal(await page.locator('#submit-guess').isEnabled(), true);
  await page.clock.fastForward(86400000);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).phase), 'guessing', 'A placed pin must never auto-submit');
  await page.reload(); await ready();
  assert.equal(await page.locator('#submit-guess').isEnabled(), true, 'Pin survives refresh');
  // Submit a known exact position through the same persisted-game restoration path.
  await page.evaluate(async () => {
    const catalog = await (await fetch('./locations.json')).json();
    const game = JSON.parse(localStorage.getItem('rgg2-game-v1'));
    const target = catalog.find(x => x.id === game.rounds[0]);
    game.guess = { lat: target.lat, lng: target.lng };
    localStorage.setItem('rgg2-game-v1', JSON.stringify(game));
  });
  await page.reload(); await ready();
  await page.locator('#submit-guess').click();
  assert.match(await page.locator('#total-score').textContent(), /5,000/);
  assert.match(await page.locator('#map-instruction').textContent(), /Perfect round/);
  await page.screenshot({ path: 'test-artifacts/reveal.png', fullPage: true });
  await page.locator('#submit-guess').click(); await ready();
  assert.equal(await page.locator('#difficulty-label').textContent(), 'LESS FAMILIAR');
  // New rounds remain open across long waits and refreshes.
  await page.clock.fastForward(86400000);
  await page.reload(); await ready();
  assert.equal(await page.locator('#submit-guess').isDisabled(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).results.length), 1);
  await page.locator('#center-pin').click();
  await page.locator('#submit-guess').click();
  for (let i = 2; i < 5; i++) {
    await page.locator('#submit-guess').click(); await ready();
    assert.equal(await page.locator('#difficulty-label').textContent(), ['HARD', 'VERY HARD', 'EXPERT'][i - 2]);
    const mapRect = await page.locator('#map').boundingBox();
    const click = { x: mapRect.x + mapRect.width * .6, y: mapRect.y + mapRect.height * .4 };
    await page.mouse.click(click.x, click.y);
    assert.equal(await page.locator('#submit-guess').isEnabled(), true);
    const pin = await page.locator('.guess-marker:not(.answer-marker) svg').boundingBox();
    assert.ok(Math.hypot(pin.x + 12 - click.x, pin.y + 32 - click.y) <= 1, 'Visible pin tip must land where the player clicked');
    await page.locator('#submit-guess').click();
  }
  await page.locator('#submit-guess').click();
  assert.equal(await page.locator('#results').isVisible(), true);
  assert.equal(await page.locator('.result-row').count(), 5);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-best-v1'))) >= 5000);
  await page.screenshot({ path: 'test-artifacts/results.png', fullPage: true });
  await page.reload();
  await page.waitForSelector('#results:not([hidden])');
  await page.locator('#credits-open').click();
  assert.equal(await page.locator('.credit-item').count(), 5);
  await page.keyboard.press('Escape');
  await page.locator('#play-again').click(); await ready();
  await assertRamp();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-artifacts/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile must not overflow horizontally');
  await page.locator('#center-pin').click();
  await page.locator('#submit-guess').click();
  assert.equal(await page.locator('#submit-guess').isEnabled(), true);
  await page.locator('#new-game').click();
  await page.locator('#restart-dialog [data-close]').last().click();
  assert.equal(await page.locator('#restart-dialog').evaluate(x => x.open), false);
  // A previous catalog's saved round order must be replaced by the new ramp.
  await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('rgg2-game-v1'));
    game.catalogVersion = 3;
    localStorage.setItem('rgg2-game-v1', JSON.stringify(game));
  });
  await page.reload(); await ready(); await assertRamp();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).results.length), 0);
  await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('rgg2-game-v1'));
    game.rounds.reverse();
    localStorage.setItem('rgg2-game-v1', JSON.stringify(game));
  });
  await page.reload(); await ready(); await assertRamp();
  // Blocked storage must not prevent playing.
  const privatePage = await context.newPage();
  await privatePage.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); }; });
  await privatePage.goto(origin);
  await privatePage.waitForFunction(() => document.getElementById('image-loading').hidden && document.getElementById('image-error').hidden);
  await privatePage.locator('#center-pin').click();
  await privatePage.locator('#submit-guess').click();
  assert.match(await privatePage.locator('#scene-badge').textContent(), /REVEALED/);
  await privatePage.close();
  const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const failurePage = await failureContext.newPage();
  await failurePage.route('https://tile.openstreetmap.org/**', route => route.abort());
  await failurePage.goto(origin);
  await failurePage.waitForSelector('#map-error:not([hidden])');
  await failurePage.waitForFunction(() => document.getElementById('image-loading').hidden);
  assert.equal(await failurePage.locator('#submit-guess').isDisabled(), true);
  assert.equal(await failurePage.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).results.length), 0);
  await failurePage.unroute('https://tile.openstreetmap.org/**');
  await failurePage.locator('#retry-map').click();
  await failurePage.waitForSelector('#map-error[hidden]', { state: 'attached' });
  await failurePage.waitForFunction(() => !document.getElementById('center-pin').disabled);
  await failurePage.evaluate(() => localStorage.clear());
  await failurePage.route('**/assets/locations/*.webp', route => route.abort());
  await failurePage.reload();
  await failurePage.waitForSelector('#image-error:not([hidden])');
  assert.equal(await failurePage.locator('#submit-guess').isDisabled(), true);
  assert.equal(await failurePage.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).results.length), 0);
  const failedId = await failurePage.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).rounds[0]);
  await failurePage.locator('#replace-photo').click();
  await failurePage.waitForSelector('#image-error:not([hidden])');
  await assertRamp(failurePage);
  assert.notEqual(await failurePage.evaluate(() => JSON.parse(localStorage.getItem('rgg2-game-v1')).rounds[0]), failedId, 'Failed photo replacement must change the view without changing difficulty');
  await failurePage.unroute('**/assets/locations/*.webp');
  await failurePage.locator('#retry-photo').click();
  await failurePage.waitForSelector('#image-error[hidden]', { state: 'attached' });
  await failurePage.waitForFunction(() => !document.getElementById('center-pin').disabled);
  await failureContext.close();
  assert.deepEqual(errors, []);
  console.log(`Browser QA passed: increasing difficulty in all five rounds and replay, ${frameAudit.total} reviewed photo frames (${frameAudit.cropped} bounded crops), ${projectionAudit.checked} pin projections (maximum tip error ${projectionAudit.maxPixelError}px), exact click placement, local photos, live map tiles, photo zoom, fullscreen, dialogs, scoring, untimed rounds across days and refreshes, results, credits, restart, mobile layout, blocked storage, and recovery from photo and map failures.`);
} finally { await context.close(); await browser.close(); }
