import { describe, expect, it } from 'vitest';
import {
  callingColdTemplateFor,
  suggestCallingFilterDue,
} from './calling-whatsapp-templates';

describe('calling filter due', () => {
  it('names the filter from how long ago the last visit was', () => {
    expect(suggestCallingFilterDue(40).due).toBe(false);
    expect(suggestCallingFilterDue(100)).toMatchObject({ due: true, badge: 'Prefilter due' });
    expect(suggestCallingFilterDue(200)).toMatchObject({ badge: 'Carbon due' });
    expect(suggestCallingFilterDue(400)).toMatchObject({ badge: 'Membrane due' });
  });

  it('uses the filter-due Meta template and keeps a service-due fallback phrase', () => {
    const cold = callingColdTemplateFor(
      'filter_due',
      'Anil',
      '',
      'hydrogenro',
      'prefilter replacement'
    );
    expect(cold.name).toBe('filter_due_notice_hro_v1');
    expect(cold.bodyParams).toEqual(['Anil', 'prefilter replacement']);
  });
});
