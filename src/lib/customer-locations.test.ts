import { describe, expect, it } from 'vitest';
import { formatSiteRoModel, getJobLocationDisplay, getSiteEquipment } from './customer-locations';

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

describe('getJobLocationDisplay', () => {
  it('uses the job snapshot address and pin even when the customer record differs', () => {
    const display = getJobLocationDisplay(
      {
        service_address: {
          street: 'A-102, Water tank, 5th Main, HSR Layout',
          landmark: 'Water tank',
          area: 'Bangalore',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
        },
        service_location: {
          latitude: 12.91,
          longitude: 77.64,
          formattedAddress: 'A-102, Water tank, 5th Main, HSR Layout',
          googleLocation: 'https://www.google.com/maps?q=12.91,77.64',
        },
      },
      {
        address: { street: 'Old street', area: 'Bangalore', city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
        location: { latitude: 12.97, longitude: 77.59, formattedAddress: 'Old street' },
      }
    );

    expect(display.address.street).toBe('A-102, Water tank, 5th Main, HSR Layout');
    expect(display.address.landmark).toBe('Water tank');
    expect(display.location.latitude).toBe(12.91);
    expect(display.location.googleLocation).toBe('https://www.google.com/maps?q=12.91,77.64');
  });
});
