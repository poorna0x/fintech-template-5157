import { describe, expect, it } from 'vitest';
import {
  expandWebsiteLeadSourceOptions,
  normalizeWebsiteLeadBrandLabel,
  resolveDefaultLeadCostFromCatalog,
  resolveLeadSourceForForm,
  type LeadCatalog,
} from './leadCatalog';
import { normalizeLeadType } from './adminUtils';

function htCatalog(): LeadCatalog {
  return {
    sources: [
      {
        id: 'src-ht',
        slug: 'home_triangle',
        label: 'Home Triangle',
        sort_order: 50,
        active: true,
        requires_otp: true,
        allow_custom_text: false,
        default_cost_inr: 231,
        aliases: [],
      },
    ],
    subTypes: [
      {
        id: 'sub-service',
        slug: 'service',
        label: 'Service',
        sort_order: 10,
        active: true,
        allow_custom_text: false,
        aliases: [],
      },
      {
        id: 'sub-install',
        slug: 'installation',
        label: 'Installation',
        sort_order: 20,
        active: true,
        allow_custom_text: false,
        aliases: [],
      },
      {
        id: 'sub-reinstall',
        slug: 'reinstallation',
        label: 'Reinstallation',
        sort_order: 30,
        active: true,
        allow_custom_text: false,
        aliases: [],
      },
      {
        id: 'sub-repair',
        slug: 'repair',
        label: 'Repair',
        sort_order: 90,
        active: true,
        allow_custom_text: false,
        aliases: [],
      },
    ],
    rules: [
      {
        id: 'r-install',
        lead_source_id: 'src-ht',
        service_sub_type_id: 'sub-install',
        cost_inr: 116,
        priority: 20,
      },
      {
        id: 'r-reinstall',
        lead_source_id: 'src-ht',
        service_sub_type_id: 'sub-reinstall',
        cost_inr: 116,
        priority: 20,
      },
    ],
  };
}

describe('resolveDefaultLeadCostFromCatalog Home Triangle', () => {
  const catalog = htCatalog();

  it('uses 231 for Service (does not steal the Installation 116 rule)', () => {
    expect(resolveDefaultLeadCostFromCatalog(catalog, 'Home Triangle', 'Service')).toBe('231');
  });

  it('uses 231 for Repair and empty subtype', () => {
    expect(resolveDefaultLeadCostFromCatalog(catalog, 'Home Triangle', 'Repair')).toBe('231');
    expect(resolveDefaultLeadCostFromCatalog(catalog, 'Home Triangle', '')).toBe('231');
  });

  it('keeps 116 only for Installation and Reinstallation', () => {
    expect(resolveDefaultLeadCostFromCatalog(catalog, 'Home Triangle', 'Installation')).toBe('116');
    expect(resolveDefaultLeadCostFromCatalog(catalog, 'Home Triangle', 'Reinstallation')).toBe(
      '116'
    );
  });
});

describe('Website HydrogenRO / ElevenRO lead brands', () => {
  it('normalizes online and manual website variants to one label each', () => {
    expect(normalizeLeadType('Website (HydrogenRO)')).toBe('Website (HydrogenRO)');
    expect(normalizeLeadType('Website (hydrogenro.com)')).toBe('Website (HydrogenRO)');
    expect(normalizeWebsiteLeadBrandLabel('Website (ElevenRO)')).toBe('Website (ElevenRO)');
    expect(normalizeLeadType('Website (elevenro.com)')).toBe('Website (ElevenRO)');
    expect(normalizeLeadType('Website')).toBe('Website');
  });

  it('expands bare Website in pickers into two brands', () => {
    const expanded = expandWebsiteLeadSourceOptions([
      { id: '1', label: 'Website', slug: 'website' },
      { id: '2', label: 'Direct call' },
    ]);
    expect(expanded.map((o) => o.label)).toEqual([
      'Website (HydrogenRO)',
      'Website (ElevenRO)',
      'Direct call',
    ]);
  });

  it('keeps branded website when mapping stored lead into the form', () => {
    expect(resolveLeadSourceForForm('Website (HydrogenRO)')).toEqual({
      label: 'Website (HydrogenRO)',
      custom: '',
    });
  });
});
