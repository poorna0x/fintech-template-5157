import { describe, expect, it } from 'vitest';
import {
  brandColor,
  buildSpreadInsights,
  findSpreadCells,
  parseSpreadPayload,
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
    sample_names: [],
    ...partial,
  };
}

describe('parseSpreadPayload', () => {
  it('keeps finite cells and drops 0,0', () => {
    const payload = parseSpreadPayload({
      cell_km: 1.2,
      jobs_total: 10,
      jobs_with_pin: 8,
      customers_with_pin: 7,
      cells: [
        { lat: 12.91, lng: 77.64, customers: 9, jobs: 12, revenue: 40000, area: 'HSR', top_brand: 'Kent', brands: [] },
        { lat: 0, lng: 0, customers: 3, jobs: 3, revenue: 1, area: 'None' },
      ],
    });
    expect(payload.cells).toHaveLength(1);
    expect(payload.cells[0].area).toBe('HSR');
    expect(payload.customers_with_pin).toBe(7);
  });

  it('keeps sample customer names on a pocket', () => {
    const payload = parseSpreadPayload({
      cells: [
        {
          lat: 13.1,
          lng: 77.39,
          customers: 1,
          area: 'Nelamangala',
          sample_names: ['Manjunath'],
        },
      ],
    });
    expect(payload.cells[0].sample_names).toEqual(['Manjunath']);
  });
});

describe('spread colors', () => {
  it('uses a hotter color for denser pockets', () => {
    const low = spreadFillColor(cell({ lat: 1, lng: 1, area: 'A', customers: 1 }), 10, 'customers');
    const high = spreadFillColor(cell({ lat: 1, lng: 1, area: 'B', customers: 10 }), 10, 'customers');
    expect(low.stroke).not.toBe(high.stroke);
    expect(brandColor('Kent')).toMatch(/^#/);
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
});

describe('findSpreadCells', () => {
  it('matches a name or area', () => {
    const cells = [
      cell({ lat: 13.1, lng: 77.39, area: 'Nelamangala', sample_names: ['Manjunath'] }),
      cell({ lat: 12.91, lng: 77.64, area: 'HSR' }),
    ];
    expect(findSpreadCells(cells, 'manju')[0].area).toBe('Nelamangala');
    expect(findSpreadCells(cells, 'nelamangala')).toHaveLength(1);
    expect(findSpreadCells(cells, 'nowhere')).toHaveLength(0);
  });
});
