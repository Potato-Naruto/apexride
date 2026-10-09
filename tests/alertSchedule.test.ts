import { describe, expect, it } from 'vitest';
import type { Maneuver } from '../shared/types';
import { MI } from '../shared/geo';
import { evaluateAlerts, ladder, newAlertState } from '../src/audio/alertSchedule';

const turn = (at: number, id = 2): Maneuver => ({
  id, at, type: 'turn', modifier: 'left', road: 'Hwy 105', text: 'turn left onto Hwy 105', location: { lat: 0, lng: 0 },
});
const prev: Maneuver = { ...turn(0, 1), road: 'Main St' };
const MPH = 0.44704;

/** Drive 1 m/s-resolution up to the turn and collect everything spoken. */
function drive(start: number, end: number, speed: number, m: Maneuver) {
  const st = newAlertState();
  const said: string[] = [];
  for (let along = start; along <= end; along += speed) {
    const a = evaluateAlerts(st, along, speed, m, prev);
    if (a) said.push(a.text);
  }
  return said;
}

describe('turn alerts', () => {
  it('speaks 0.75 / 0.5 / 0.25 mi then a final warning at 45 mph', () => {
    const said = drive(0, 1.5 * MI, 45 * MPH, turn(1.5 * MI));
    expect(said).toHaveLength(4);
    expect(said[0]).toMatch(/three quarters/);
    expect(said[1]).toMatch(/half a mile/);
    expect(said[2]).toMatch(/quarter mile/);
    expect(said[3]).toMatch(/feet/);
  });

  it('adds a 1 mile heads-up at highway speed and widens the final warning', () => {
    expect(ladder(30).some((s) => s.key === '1')).toBe(true);
    expect(ladder(10).some((s) => s.key === '1')).toBe(false);
    const fin = ladder(31).find((s) => s.final)!;
    expect(fin.dist).toBeGreaterThan(0.1 * MI);
  });

  it('does not announce rungs already passed when joining mid-leg', () => {
    const st = newAlertState();
    const a = evaluateAlerts(st, 0.9 * MI, 20, turn(MI), prev); // 0.1 mi from turn
    expect(a?.text ?? '').not.toMatch(/half|quarter|three/);
  });
});

describe('long-stretch reassurance', () => {
  it('chimes every 10 miles with remaining distance', () => {
    const m = turn(45 * MI);
    const st = newAlertState();
    const alerts = [];
    for (let along = 0; along <= 44 * MI; along += 400) {
      const a = evaluateAlerts(st, along, 28, m, prev);
      if (a?.kind === 'reassure') alerts.push(a);
    }
    expect(alerts.length).toBe(4);
    expect(alerts[0].chime).toBe(true);
    expect(alerts[0].text).toMatch(/Continue on Main St for another 35 miles/);
  });
});
