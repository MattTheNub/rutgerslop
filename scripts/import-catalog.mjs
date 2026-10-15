// Development import: only include Commons files with explicit camera GPS metadata.
// Usage: node scripts/import-catalog.mjs /tmp
import fs from 'node:fs';
import path from 'node:path';
import { verifiedCameraPosition } from './coordinate-evidence.mjs';
const sourceDir = process.argv[2] || '/tmp';
const evidence = JSON.parse(fs.readFileSync('data/coordinate-evidence.json', 'utf8'));
const strip = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const records = new Map();
const inputFiles = fs.readdirSync(sourceDir).filter(f => /^rutgers-(cat-\d+|geo-meta-\d+|north-extra|serc|life)\.json$/.test(f));
inputFiles.push('busch.json', 'livingston.json');
const groupPatterns = [
  [/Buell Brook|Blue Trail|Orange Trail|Green Trail|Yellow Trail|White Trail|Kilmer Woods/i, 'Ecological Preserve'],
  [/College Hall|CollegeHall|Jarrard|Jarrad/i, 'College Hall'],
  [/Wood ?Lawn|EIPbldg/i, 'Wood Lawn'],
  [/Perry/i, 'Perry Residence Hall'], [/Newell/i, 'Newell Apartments'],
  [/Cook Campus Center|Cook Student Center/i, 'Cook Student Center'],
  [/Environmental.*Natural Resource/i, 'Environmental & Natural Resource Sciences'],
  [/Douglass Student Center/i, 'Douglass Student Center'],
  [/Douglass Library/i, 'Mabel Smith Douglass Library'],
  [/Martin Hall/i, 'Martin Hall'], [/Loree/i, 'Loree Building'], [/Hickman/i, 'Hickman Hall'],
  [/Postal, Administration|PAL building/i, 'PAL Building'],
  [/Cook.Douglass Recreation/i, 'Cook–Douglass Recreation Center'],
  [/Neilson/i, 'Neilson Dining Hall'], [/University Post Office/i, 'Douglass Post Office'],
  [/Thompson/i, 'Thompson Hall'], [/Bartlett/i, 'Bartlett Hall'], [/Blake/i, 'Blake Hall'],
  [/Voorhees Chapel/i, 'Voorhees Chapel'], [/Carpender/i, 'Carpender Hall'],
  [/Heldrich Science/i, 'Regina B. Heldrich Science Building'], [/Ruth.*Adams/i, 'Ruth Adams Building'],
  [/Biological Sciences/i, 'Biological Sciences Building'], [/Jameson/i, 'Jameson Residence Hall'],
  [/Waller/i, 'Waller Hall'], [/equine research/i, 'Equine Research Farm'],
  [/Starkey/i, 'Starkey Apartments'], [/Food Science.*Nutritional/i, 'Food Science & Nutritional Sciences'],
  [/Nicholas/i, 'Nicholas Residence Hall'], [/Zimmerli/i, 'Zimmerli Art Museum'],
  [/New Jersey Hall|NewJerseyHall/i, 'New Jersey Hall'], [/Johnston Hall|JohnstonHall/i, 'Alexander Johnston Hall'],
  [/Demarest/i, 'Demarest House'], [/College Avenue Gymnasium|CollegeAveGym/i, 'College Avenue Gymnasium'],
  [/Bishop/i, 'Bishop House'], [/Schanck/i, 'Schanck Observatory'], [/Winants/i, 'Winants Hall'],
  [/Old Queens|OldQueens/i, 'Old Queens'], [/Van Nest/i, 'Van Nest Hall'],
  [/Kirkpatrick/i, 'Kirkpatrick Chapel'], [/Geology|geology/i, 'Geology Hall'], [/Miller Hall/i, 'Miller Hall'],
  [/Honors College/i, 'Honors College'], [/Alexander Library/i, 'Alexander Library'],
  [/School of Social Work/i, 'School of Social Work'], [/1902 Memorial Gateway|Rutgers1458|CollegeAveGates/i, 'Class of 1902 Gateway'],
  [/The Gateway/i, 'Gateway Transit Village'],
  [/Science and Engineering Resource|SERC|Serc|classrooms|classroom 01|Coke Cola/i, 'Science & Engineering Resource Center'],
  [/Life Sciences/i, 'Life Sciences Building'], [/Chemistry and Chemical Biology/i, 'Chemistry & Chemical Biology Building'],
  [/Research Tower/i, 'Robert Wood Johnson Research Tower'], [/Math Library/i, 'Hill Center Math Library'],
  [/Business School/i, 'Rutgers Business School'], [/TV Barracks/i, 'Camp Kilmer Barracks'],
  [/Rutgers Cinema/i, 'Rutgers Cinema'], [/Athletic Center|Jersey Mike/i, 'Jersey Mike’s Arena'],
  [/Rutgers Stadium|Shi Stadium|Michigan at Rutgers/i, 'SHI Stadium'], [/Golf Course/i, 'Rutgers Golf Course']
];
for (const file of inputFiles) {
  if (!fs.existsSync(path.join(sourceDir, file))) continue;
  const data = JSON.parse(fs.readFileSync(path.join(sourceDir, file)));
  for (const page of Object.values(data.query?.pages || {})) {
    const info = page.imageinfo?.[0], meta = info?.extmetadata;
    if (!meta || !/\.(jpe?g|png)$/i.test(page.title)) continue;
    const proof = evidence.locations[String(page.pageid)];
    if (!proof || proof.status !== 'accepted') continue;
    const { lat, lng } = verifiedCameraPosition(proof);
    if (lat < 40.47 || lat > 40.535 || lng < -74.481 || lng > -74.419) continue;
    if (/plaque|information|Commencement|dogwood|crabapple|sign describing|vending|abandoned|flowers|architectural detail|cupola/i.test(page.title)) continue;
    const match = groupPatterns.find(([re]) => re.test(page.title));
    if (!match) continue;
    let name = match[1], group = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (name === 'Ecological Preserve') {
      const trail = page.title.match(/(Blue|Orange|Green|Yellow|White|Red) Trail/i)?.[1];
      name = `${trail || 'Buell Brook'} · Ecological Preserve`;
      group = `preserve-${Math.floor(lat * 600)}-${Math.floor(-lng * 450)}`;
    }
    const campus = name.includes('Ecological Preserve') ? 'Ecological Preserve' : lat < 40.491 ? 'Cook–Douglass' : lat < 40.509 ? 'College Avenue' : lng > -74.445 ? 'Livingston' : 'Busch';
    // Exclude files whose photographer/license metadata cannot be retained.
    const artist = strip(meta.Artist?.value), license = strip(meta.LicenseShortName?.value);
    if (!artist || !license || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(info.thumburl || info.url)) continue;
    records.set(String(page.pageid), { id: String(page.pageid), group, name, campus, lat, lng, image: `assets/locations/${page.pageid}.webp`, source: info.descriptionurl, artist, license, licenseUrl: meta.LicenseUrl?.value || '', original: info.url.split('?')[0], download: (info.thumburl || info.url).split('?')[0], description: strip(meta.ImageDescription?.value) });
  }
}
// A maximum of four views per building avoids weighting the pool toward heavily photographed places.
const groups = new Map();
for (const item of [...records.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const group = groups.get(item.group) || [];
  if (group.length < (item.group.startsWith('preserve-') ? 1 : 4)) group.push(item);
  groups.set(item.group, group);
}
let preserveCount = 0;
const result = [...groups.values()].flat().filter(x => !x.group.startsWith('preserve-') || preserveCount++ < 12);
fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('dist/assets/locations', { recursive: true });
fs.writeFileSync('data/catalog.json', JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync('/tmp/rutgers-downloads.json', JSON.stringify(result.map(x => ({ id: x.id, url: x.download }))));
console.log(JSON.stringify({ photographs: result.length, locations: new Set(result.map(x => x.group)).size, campuses: result.reduce((s, x) => (s[x.campus] = (s[x.campus] || 0) + 1, s), {}), names: [...new Set(result.map(x => x.name))] }));
