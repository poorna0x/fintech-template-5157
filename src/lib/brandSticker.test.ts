import { describe, expect, it } from 'vitest';
import { jobStickerSkipped, stickerPhotoUrlsFromJob, stickerSkipLabel } from './brandSticker';

describe('brand sticker job photos', () => {
  it('reads sticker urls and ignores a skip flag when a photo exists', () => {
    const job = {
      requirements: [
        { sticker_photos: ['https://res.cloudinary.com/secondary/sticker.jpg'] },
        { sticker_skipped: true },
      ],
    };
    expect(stickerPhotoUrlsFromJob(job)).toEqual([
      'https://res.cloudinary.com/secondary/sticker.jpg',
    ]);
    expect(jobStickerSkipped(job)).toBe(false);
  });

  it('labels a skipped sticker for the completed job card', () => {
    expect(
      stickerSkipLabel({
        requirements: [{ bill_photos: ['https://example.com/bill.jpg'] }],
      })
    ).toBeNull();
    expect(
      stickerSkipLabel({
        completed_at: '2026-10-12T10:00:00.000Z',
        requirements: [{ sticker_skipped: true }],
      })
    ).toMatch(/^Brand sticker skipped · /);
  });
});
