import { describe, expect, it } from 'vitest';
import {
  isActiveTechnicianAccount,
  isSalaryListedTechnician,
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
});
