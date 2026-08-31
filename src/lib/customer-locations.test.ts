import { describe, expect, it } from 'vitest';
import { formatSiteRoModel, getSiteEquipment } from './customer-locations';

const dualSiteCustomer = {
  brand: 'AO Smith',
  model: 'P6',
  service_type: 'RO',
  alternate_brand: 'Kent',
  alternate_model: 'Grand Plus',
  alternate_service_type: 'RO',
};

describe('formatSiteRoModel', () => {
  it('uses primary brand and model for the home site', () => {
    expect(formatSiteRoModel(dualSiteCustomer, 'primary')).toBe('AO Smith P6');
  });

  it('uses alternate brand and model for the second site', () => {
    expect(formatSiteRoModel(dualSiteCustomer, 'secondary')).toBe('Kent Grand Plus');
  });

  it('skips missing brand or model parts', () => {
    expect(formatSiteRoModel({ brand: 'Aquaguard', model: '' }, 'primary')).toBe('Aquaguard');
    expect(formatSiteRoModel({ alternate_brand: '', alternate_model: '' }, 'secondary')).toBe('');
  });
});

describe('getSiteEquipment', () => {
  it('reads secondary equipment from alternate_* fields', () => {
    expect(getSiteEquipment(dualSiteCustomer, 'secondary')).toEqual({
      serviceType: 'RO',
      brand: 'Kent',
      model: 'Grand Plus',
    });
  });
});
