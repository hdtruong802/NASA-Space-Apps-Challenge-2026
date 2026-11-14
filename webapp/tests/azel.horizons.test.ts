import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AU_KM, computeAzEl } from '../src/lib/lunarMath';

interface RefSite {
  slug: string;
  latDeg: number;
  lonDeg: number;
}

const REFERENCE_SITES: RefSite[] = [
  { slug: 'apollo_11', latDeg: 0.67408, lonDeg: 23.47297 },
  { slug: 'chang_e_4_far_side', latDeg: -45.4446, lonDeg: 177.5991 },
  { slug: 'chandrayaan_3_isro', latDeg: -69.3733, lonDeg: 32.3191 },
  { slug: 'im_1_odysseus_clps', latDeg: -80.13, lonDeg: 1.44 },
  { slug: 'im_2_athena_clps', latDeg: -84.7906, lonDeg: 29.1957 },
  { slug: 'connecting_ridge_approx', latDeg: -89.45, lonDeg: -137.3 },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function parseCsvByHeader(filePath: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(`Fixture CSV has no data rows: ${filePath}`);
  }
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = (cols[c] ?? '').trim();
    }
    rows.push(record);
  }
  return rows;
}

function greatCircleSkyErrorDeg(
  predAzDeg: number,
  predElDeg: number,
  refAzDeg: number,
  refElDeg: number,
): number {
  const dAz = ((((predAzDeg - refAzDeg + 540.0) % 360.0) + 360.0) % 360.0) - 180.0;
  const dEl = predElDeg - refElDeg;
  const cosEl = Math.cos((refElDeg * Math.PI) / 180.0);
  return Math.hypot(dAz * cosEl, dEl);
}

describe('JPL Horizons Az/El safety net', () => {
  const subpointsPath = path.join(FIXTURES_DIR, 'moon_subpoints_1h.csv');
  const subRows = parseCsvByHeader(subpointsPath);
  const subByIdx = new Map<number, Record<string, string>>();
  for (const row of subRows) {
    subByIdx.set(Number.parseInt(row['idx'], 10), row);
  }

  for (const site of REFERENCE_SITES) {
    it(`matches JPL Horizons Sun & Earth Az/El for ${site.slug}`, () => {
      const sunPath = path.join(FIXTURES_DIR, `topo_${site.slug}_sun.csv`);
      const earthPath = path.join(FIXTURES_DIR, `topo_${site.slug}_earth.csv`);
      const sunRows = parseCsvByHeader(sunPath);
      const earthRows = parseCsvByHeader(earthPath);

      expect(sunRows.length).toBeGreaterThan(700);
      expect(earthRows.length).toBe(sunRows.length);

      let maxSunErrDeg = 0;
      let maxEarthErrDeg = 0;

      for (let i = 0; i < sunRows.length; i++) {
        const sRow = sunRows[i];
        const eRow = earthRows[i];
        const idx = Number.parseInt(sRow['idx'], 10);
        expect(Number.parseInt(eRow['idx'], 10)).toBe(idx);

        const sub = subByIdx.get(idx);
        expect(sub).toBeDefined();
        if (!sub) continue;

        expect(sRow['time_utc']).toBe(sub['time_utc']);
        expect(eRow['time_utc']).toBe(sub['time_utc']);

        const subSolarLon = Number.parseFloat(sub['subsolar_lon']);
        const subSolarLat = Number.parseFloat(sub['subsolar_lat']);
        const subEarthLon = Number.parseFloat(sub['subearth_lon']);
        const subEarthLat = Number.parseFloat(sub['subearth_lat']);
        const earthDistKm = Number.parseFloat(sub['earth_moon_au']) * AU_KM;

        const predSun = computeAzEl(site.latDeg, site.lonDeg, 0.0, subSolarLon, subSolarLat, AU_KM);
        const refSunAz = Number.parseFloat(sRow['az_deg']);
        const refSunEl = Number.parseFloat(sRow['el_deg']);
        const sunErr = greatCircleSkyErrorDeg(predSun.azDeg, predSun.elDeg, refSunAz, refSunEl);
        if (sunErr > maxSunErrDeg) maxSunErrDeg = sunErr;

        const predEarth = computeAzEl(
          site.latDeg,
          site.lonDeg,
          0.0,
          subEarthLon,
          subEarthLat,
          earthDistKm,
        );
        const refEarthAz = Number.parseFloat(eRow['az_deg']);
        const refEarthEl = Number.parseFloat(eRow['el_deg']);
        const earthErr = greatCircleSkyErrorDeg(
          predEarth.azDeg,
          predEarth.elDeg,
          refEarthAz,
          refEarthEl,
        );
        if (earthErr > maxEarthErrDeg) maxEarthErrDeg = earthErr;
      }

      console.info(
        `[Az/El Horizons] ${site.slug}: maxSunErr=${maxSunErrDeg.toFixed(6)} deg, maxEarthErr=${maxEarthErrDeg.toFixed(6)} deg (${sunRows.length} samples)`,
      );

      expect(maxSunErrDeg).toBeLessThanOrEqual(0.001);
      expect(maxEarthErrDeg).toBeLessThanOrEqual(0.01);
    });
  }
});
