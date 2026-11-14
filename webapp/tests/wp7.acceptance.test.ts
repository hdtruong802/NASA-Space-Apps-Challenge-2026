import { describe, it } from 'vitest';

describe('WP7 Acceptance — Computed Candidate Site Discovery', () => {
  it.todo('Mode A unconstrained sun ranking in |x|,|y| <= 42 km ranks near connecting_ridge (90.6% +/- 0.5%) and includes peak_near_shackleton and shackleton_rim in top 10');
  it.todo('Mode A default constraints (maxSlopeDeg <= 5, minFlat1kmPct >= 20, minSepKm >= 2.4) rank near peak_near_shackleton and connecting_ridge at top with composite score');
  it.todo('opening any computed candidate as a pin yields sun/earth metrics within 2 percentage points of candidate table values');
  it.todo('strict constraints (e.g. minFlat1kmPct = 50 with sun >= 70%) return an empty list gracefully with blocking constraint counts and no error');
  it.todo('computed candidates never carry mission_status or provenance.source_url and never contain banned claims ("best landing site", "safe", "recommended landing site")');
  it.todo('Mode B window scan around a selected site matches computeInstantAndWindow metrics at the evaluated coordinate');
});
