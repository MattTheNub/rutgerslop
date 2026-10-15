# Rutgers GeoGuessr 2

A campus photo guessing game with 74 reviewed views across 56 locations. Every game has five untimed rounds of increasing difficulty, from recognizable surroundings to obscure angles, unmarked paths and generic interiors. No filters or difficulty settings. Explore an interactive map, place a pin, and score up to 5,000 points per round. Only locking in a guess ends a round. Photographs, fonts, and the map library are bundled locally; map tiles require internet access.

## Run

Requires Node.js 20 or newer. No dependencies or API keys.

```sh
npm start
```

Open http://localhost:3000. Set `PORT` to use another port. The `dist/` directory can also be hosted on any static web server.

```sh
npm test
npm run build
```

## GitHub Pages

The game is a static site and works under a repository URL such as `https://YOUR-USERNAME.github.io/rutgers-geoguessr-2/`. All game assets use relative paths.

1. Push this project to a GitHub repository, including `dist/`, `data/`, `scripts/`, `test/`, and `.github/workflows/pages.yml`.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow** on the default branch, or push another commit to that branch.

The included workflow runs the tests and coordinate/build checks, then publishes only `dist/`. It supports any default-branch name. No API keys, dependency installation, or backend server are needed. Future pushes to the default branch deploy automatically. The published URL appears in the deployment's `github-pages` environment. Enabling Pages and running this workflow on GitHub must be done in your repository; adding the workflow locally does not publish the site.

## Location data

`data/catalog.json` retains the Wikimedia Commons source, original image URL, photographer, license, image description, and camera coordinates for each photograph. The shipped client catalog is `dist/locations.json`. Photos are resized to WebP for delivery. No coordinates are guessed from building names. Photographers and licenses appear during play; original photo links and license terms unlock after each round.

`data/photo-review.json` records the visual review and a difficulty rating from 1 to 5 for every approved source photo. Recognizable settings, including the horse pasture and broad courtyard views, remain in the earlier rounds; less distinctive architecture, partial views, unmarked woodland and anonymous classrooms occupy later rounds. Ratings are editorial judgments about the visual clues, rather than measured player success rates. Readable location signs and named entrances are excluded or framed out. The viewer creates the selected frame before enabling zoom or fullscreen; those controls cannot expose pixels outside it. Camera coordinates remain those of the original photo. Approved image hashes, frame selections and difficulty ratings are checked during each build, so changed or unreviewed photos cannot silently enter the game. Run `npm run build` after changing a review decision to regenerate the playable catalog.

`data/coordinate-evidence.json` records the source revision, explicit camera-location template, and original EXIF GPS when available for every audited photo. Camera templates are distinguished from object/building coordinates. Full numerical precision is retained, preferring EXIF when it agrees with the camera template within one meter. Eleven object-only, misplaced, or uncertain camera points are excluded, including indoor photos sharing generic building coordinates. Suspect building positions were checked against the official Rutgers campus map. Source GPS and contributor-entered coordinates have measurement uncertainty; this audit does not establish survey-grade physical accuracy.

Run `npm run audit:coordinates` to compare every playable pin to its retained evidence. The same audit is mandatory in `npm run build`. Importing new photos requires accepted camera-coordinate evidence; unknown or excluded photos are skipped. Both rendered pin tips use the same SVG geometry and exact map anchor. Saved games from before the coordinate audit restart with the corrected catalog.

Scoring uses haversine distance to the recorded camera position: 5,000 within 20 meters, then `round(5000 × exp(-(distance - 20) / 350))`. Rounds draw from difficulty levels 1, 2, 3, 4 and 5 in that order, with five different location groups. Selection prefers places and photos not recently shown and backtracks when needed to preserve both difficulty order and distinct locations. A replacement for a failed image stays at the current round's difficulty. Games saved before this progression restart; current games and personal bests stay in browser local storage.

Leaflet 1.9.4 is distributed under BSD-2-Clause; see `dist/vendor/LEAFLET-LICENSE`. Map attribution is provided in the map. This independent game is not affiliated with Rutgers University.
# rutgerslop
