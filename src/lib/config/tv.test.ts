import { describe, it, expect } from 'vitest';
import { TV_SCREENS, CATEGORY_COLORS } from './tv';
import type { TickerCategory } from './tv';

describe('TV config', () => {
  it('has 20 screens', () => {
    expect(TV_SCREENS).toHaveLength(20);
  });

  it('all screens have positive duration', () => {
    for (const screen of TV_SCREENS) {
      expect(screen.durationMs).toBeGreaterThan(0);
    }
  });

  it('all screen IDs are unique', () => {
    const ids = TV_SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('map screens have 15s duration', () => {
    const maps = TV_SCREENS.filter((s) => s.screenType === 'map');
    for (const m of maps) {
      expect(m.durationMs).toBe(15000);
    }
  });

  it('hero screens have 22s duration', () => {
    const heroes = TV_SCREENS.filter((s) => s.screenType === 'hero');
    for (const h of heroes) {
      expect(h.durationMs).toBe(22000);
    }
  });

  it('card screens have 12s duration', () => {
    const cards = TV_SCREENS.filter((s) => s.screenType === 'card');
    for (const c of cards) {
      expect(c.durationMs).toBe(12000);
    }
  });

  it('IDX category has a color', () => {
    expect(CATEGORY_COLORS['IDX' as TickerCategory]).toBeDefined();
  });
});
