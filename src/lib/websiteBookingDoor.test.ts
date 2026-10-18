import { beforeEach, describe, expect, it } from 'vitest';
import { jobBookedViaQr, markWebsiteBookDoor, publicBookingVia } from './websiteBookingDoor';

describe('website booking door', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('treats a direct open of /book as a sticker', () => {
    expect(publicBookingVia()).toBe('qr');
  });

  it('treats a site Book tap as the website', () => {
    markWebsiteBookDoor();
    expect(publicBookingVia()).toBe('website');
  });

  it('shows QR only when the saved booking says qr', () => {
    expect(
      jobBookedViaQr([{ lead_source: 'Website (HydrogenRO)', booking_via: 'qr' }])
    ).toBe(true);
    expect(
      jobBookedViaQr([{ lead_source: 'Website (ElevenRO)', booking_via: 'website' }])
    ).toBe(false);
    expect(jobBookedViaQr([{ lead_source: 'Website (HydrogenRO)' }])).toBe(false);
    expect(
      jobBookedViaQr('[{"lead_source":"Website (HydrogenRO)","booking_via":"qr"}]')
    ).toBe(true);
  });
});
