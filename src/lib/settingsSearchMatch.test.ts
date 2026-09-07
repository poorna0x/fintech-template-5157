import { describe, expect, it } from 'vitest';
import { scoreSettingsMatch } from './settingsSearchMatch';

const whatsapp = {
  id: 'whatsapp-inbox',
  label: 'WhatsApp inbox',
  description: 'Read and send customer messages',
  keywords: 'chat messages meta cloud api',
};

const reminders = {
  id: 'reminders',
  label: 'Reminders',
  description: 'Search, filter and edit reminders',
  keywords: 'todo follow up alert customer general',
};

const advanced = {
  id: 'advanced-customer-search',
  label: 'Advanced customer search',
  description: 'Find customers using combined filters',
  keywords: 'brand model location nearby service amc never gst date filter',
};

const technician = {
  id: 'technician-management',
  label: 'Technician management',
  description: 'Add, edit or deactivate technicians',
  keywords: 'staff employee account salary password',
};

describe('scoreSettingsMatch typos', () => {
  it('still ranks an exact label first', () => {
    expect(scoreSettingsMatch(whatsapp, 'WhatsApp inbox')).toBe(1000);
  });

  it('finds WhatsApp when a letter is missing', () => {
    expect(scoreSettingsMatch(whatsapp, 'whatsap')).toBeGreaterThan(0);
    expect(scoreSettingsMatch(whatsapp, 'watsapp')).toBeGreaterThan(0);
  });

  it('finds Reminders with a swapped letter', () => {
    expect(scoreSettingsMatch(reminders, 'remiders')).toBeGreaterThan(0);
  });

  it('finds Advanced search when search is misspelled', () => {
    expect(scoreSettingsMatch(advanced, 'advnced serach')).toBeGreaterThan(0);
  });

  it('finds technician with a near spelling', () => {
    expect(scoreSettingsMatch(technician, 'techinician')).toBeGreaterThan(0);
  });

  it('does not match unrelated junk', () => {
    expect(scoreSettingsMatch(whatsapp, 'xyzzy')).toBe(0);
  });
});
