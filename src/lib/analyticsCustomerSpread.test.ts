import { describe, expect, it } from 'vitest';
import {
  brandColor,
  buildSpreadInsights,
  customersWithoutMap,
  jobsWithoutMap,
  parseSpreadPayload,
  pocketBrandRows,
  spreadCircleRadiusMeters,
  spreadFillColor,
  type SpreadCell,
} from './analyticsCustomerSpread';

function cell(partial: Partial<SpreadCell> & Pick<SpreadCell, 'lat' | 'lng' | 'area'>): SpreadCell {
  return {
    customers: 4,
    jobs: 6,
    revenue: 12000,
    avg_bill: 2000,
    avg_tds: null,
    installation: 2,
    service: 4,
    top_brand: 'Kent',
    top_brand_jobs: 4,
    top_brand_share: 67,
    brands: [{ name: 'Kent', jobs: 4, revenue: 8000 }],
    ...partial,
  };
}

describe('parseSpreadPayload', () => {
  it('keeps finite cells and drops 0,0', () => {
    const payload = parseSpreadPayload({
      cell_km: 1.2,
      jobs_total: 10,
      jobs_with_pin: 8,
      customers_total: 12,
      customers_with_pin: 7,
      cells: [
        { lat: 12.91, lng: 77.64, customers: 9, jobs: 12, revenue: 40000, area: 'HSR', top_brand: 'Kent', brands: [] },
        { lat: 0, lng: 0, customers: 3, jobs: 3, revenue: 1, area: 'None' },
      ],
    });
    expect(payload.cells).toHaveLength(1);
    expect(payload.cells[0].area).toBe('HSR');
    expect(payload.customers_with_pin).toBe(7);
    expect(payload.customers_total).toBe(12);
    expect(customersWithoutMap(payload)).toBe(5);
    expect(jobsWithoutMap(payload)).toBe(2);
  });
});

describe('spread colors', () => {
  it('uses a hotter color for denser pockets', () => {
    const low = spreadFillColor(cell({ lat: 1, lng: 1, area: 'A', customers: 1 }), 10, 'customers');
    const high = spreadFillColor(cell({ lat: 1, lng: 1, area: 'B', customers: 10 }), 10, 'customers');
    expect(low.stroke).not.toBe(high.stroke);
    expect(brandColor('Kent')).toMatch(/^#/);
  });

  it('does not invent a brand color when a pocket has no jobs', () => {
    const empty = spreadFillColor(
      cell({ lat: 1, lng: 1, area: 'Quiet', jobs: 0, top_brand: 'Unknown', brands: [] }),
      10,
      'brand'
    );
    expect(empty.stroke).toBe('#64748b');
  });
});

describe('pocketBrandRows', () => {
  it('hides Unknown when a pocket has no jobs this period', () => {
    expect(pocketBrandRows(cell({ lat: 1, lng: 1, area: 'West', jobs: 0, top_brand: 'Unknown', brands: [] }))).toEqual(
      []
    );
  });
});

describe('buildSpreadInsights', () => {
  it('flags the busiest and highest-billing pockets', () => {
    const insights = buildSpreadInsights([
      cell({ lat: 12.91, lng: 77.64, area: 'HSR', customers: 20, jobs: 30, revenue: 50000, avg_bill: 1600 }),
      cell({
        lat: 12.93,
        lng: 77.68,
        area: 'Bellandur',
        customers: 6,
        jobs: 8,
        revenue: 80000,
        avg_bill: 10000,
        top_brand: 'Aquaguard',
        top_brand_share: 80,
        top_brand_jobs: 7,
      }),
    ]);
    expect(insights.some((row) => row.id === 'densest' && row.cell.area === 'HSR')).toBe(true);
    expect(insights.some((row) => row.id === 'richest' && row.cell.area === 'Bellandur')).toBe(true);
    expect(insights.some((row) => row.id === 'premium')).toBe(true);
    expect(insights.some((row) => row.id === 'brand' && /Aquaguard/.test(row.title))).toBe(true);
  });

  it('flags pockets with many return visits', () => {
    const insights = buildSpreadInsights([
      cell({ lat: 12.91, lng: 77.64, area: 'HSR', customers: 20, jobs: 22, revenue: 40000 }),
      cell({ lat: 13.1, lng: 77.39, area: 'Nelamangala', customers: 4, jobs: 12, revenue: 18000 }),
    ]);
    expect(insights.some((row) => row.id === 'repeat' && row.cell.area === 'Nelamangala')).toBe(true);
  });
});

describe('pocket size', () => {
  it('draws bigger circles for larger packets', () => {
    const pocket = cell({ lat: 13.1, lng: 77.39, area: 'Nelamangala', customers: 4 });
    const large = spreadCircleRadiusMeters(pocket, 10, 6);
    const small = spreadCircleRadiusMeters(pocket, 10, 1.2);
    expect(large).toBeGreaterThan(small * 3);
  });
});
