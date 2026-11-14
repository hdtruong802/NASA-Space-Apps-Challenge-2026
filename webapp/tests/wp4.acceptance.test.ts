import { describe, it } from 'vitest';

describe('WP4 Acceptance — Horizon Panorama & Mission Timeline', () => {
  it.todo('seasonal marker detector finds Southern Hemisphere summer peaks within +/-1 day of 2027-11-07 and 2028-10-04 and winter peaks around 2027-04-27 and 2028-04-19 from subsolar_lat');
  it.todo('MissionTimeline derives date bounds and axis ticks dynamically from ephemeris t0_utc and n with no hardcoded seasonal strings');
  it.todo('two HorizonSkyView instances rendered side-by-side use unique SVG gradient IDs and each renders only its own site sun/earth/horizon');
  it.todo('when rendering apollo_11 (terrain_source === "NONE"), HorizonSkyView subtitle states smooth spherical horizon and hover tooltip omits blocking ridge distance');
  it.todo('at index n-100, window panel displays actual windowHoursAvailable rather than hardcoded 336 hours');
});
