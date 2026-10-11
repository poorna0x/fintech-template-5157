import { describe, expect, it } from 'vitest';
import { collectStickerSkipNotes, jobStickerSkipped, stickerPhotoUrlsFromJob } from './brandSticker';

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

  it('notes a skipped sticker and stays quiet when nothing was asked', () => {
    const notes = collectStickerSkipNotes([
      { requirements: [{ bill_photos: ['https://example.com/bill.jpg'] }] },
      {
        job_number: 'J12',
        completed_at: '2026-10-11T10:00:00.000Z',
        requirements: [{ sticker_skipped: true }],
      },
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^Brand sticker skipped · J12 · /);
  });
});
