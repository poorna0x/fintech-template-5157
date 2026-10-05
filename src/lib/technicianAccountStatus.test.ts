import { describe, expect, it } from 'vitest';
import {
  isActiveTechnicianAccount,
  isSalaryListedTechnician,
  isSuspendedTechnicianAccount,
  technicianAccountStatus,
} from './technicianAccountStatus';

describe('technicianAccountStatus', () => {
  it('treats suspended as not on salary lists', () => {
    const suspended = { account_status: 'SUSPENDED' };
    expect(technicianAccountStatus(suspended)).toBe('SUSPENDED');
    expect(isSalaryListedTechnician(suspended)).toBe(false);
    expect(isActiveTechnicianAccount(suspended)).toBe(false);
  });

  it('treats inactive as not on salary lists', () => {
    expect(isSalaryListedTechnician({ account_status: 'INACTIVE' })).toBe(false);
  });

  it('keeps active technicians on salary lists', () => {
    expect(isSalaryListedTechnician({ account_status: 'ACTIVE' })).toBe(true);
    expect(isSalaryListedTechnician({})).toBe(true);
  });

  it('flags only suspended accounts for QR hiding', () => {
    expect(isSuspendedTechnicianAccount({ account_status: 'SUSPENDED' })).toBe(true);
    expect(isSuspendedTechnicianAccount({ account_status: 'suspended' })).toBe(true);
    expect(isSuspendedTechnicianAccount({ account_status: 'INACTIVE' })).toBe(false);
    expect(isSuspendedTechnicianAccount({ account_status: 'ACTIVE' })).toBe(false);
    expect(isSuspendedTechnicianAccount({})).toBe(false);
  });
});
