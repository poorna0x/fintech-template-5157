// Tests for the offline photo queue + retry worker fixes:
//  1. Retry worker links 'after'/'before'/'other' photos to job photo columns
//     (previously silently dropped: uploaded to Cloudinary, never written to DB).
//  2. Uploaded-but-unlinked queue entries survive the retry cap and eviction.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadImageMock = vi.fn();
const getByIdFullMock = vi.fn();
const jobUpdateMock = vi.fn();

vi.mock('@/lib/cloudinary', () => ({
  cloudinaryService: { uploadImage: (...args: unknown[]) => uploadImageMock(...args) },
  compressImage: vi.fn(async (file: File) => file),
}));

vi.mock('@/lib/supabase', () => ({
  db: {
    jobs: {
      getByIdFull: (...args: unknown[]) => getByIdFullMock(...args),
      update: (...args: unknown[]) => jobUpdateMock(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  getQueuedPhotos,
  queuePhoto,
  setQueuedPhotoUploadedUrl,
  type QueuedPhoto,
} from '@/lib/offlinePhotoQueue';
import { processQueuedPhotos } from '@/lib/retryPhotoUpload';

const QUEUE_KEY = 'offline_photo_queue';

const makeEntry = (overrides: Partial<QueuedPhoto> = {}): QueuedPhoto => ({
  id: `photo_${Math.random().toString(36).slice(2)}`,
  fileData: 'data:image/jpeg;base64,/9j/AAAA',
  fileName: 'test.jpg',
  folder: 'job-completion',
  timestamp: Date.now(),
  retryCount: 0,
  ...overrides,
});

const seedQueue = (entries: QueuedPhoto[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  jobUpdateMock.mockResolvedValue({ error: null });
});

describe('offlinePhotoQueue retry-cap and eviction behavior', () => {
  it('drops non-uploaded entries at the retry cap but keeps uploaded-but-unlinked ones', () => {
    seedQueue([
      makeEntry({ id: 'exhausted_no_upload', retryCount: 5 }),
      makeEntry({ id: 'exhausted_but_uploaded', retryCount: 99, uploadedUrl: 'https://res.cloudinary.com/x/a.jpg' }),
      makeEntry({ id: 'fresh', retryCount: 0 }),
    ]);

    const ids = getQueuedPhotos().map((p) => p.id);
    expect(ids).toContain('exhausted_but_uploaded');
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('exhausted_no_upload');
  });

  it('expires uploaded-but-unlinked entries only after 7 days', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    seedQueue([
      makeEntry({ id: 'old_uploaded', timestamp: eightDaysAgo, uploadedUrl: 'https://res.cloudinary.com/x/a.jpg' }),
      makeEntry({ id: 'recent_uploaded', uploadedUrl: 'https://res.cloudinary.com/x/b.jpg' }),
    ]);

    const ids = getQueuedPhotos().map((p) => p.id);
    expect(ids).toEqual(['recent_uploaded']);
  });

  it('setQueuedPhotoUploadedUrl clears base64 bytes and resets retryCount', () => {
    seedQueue([makeEntry({ id: 'p1', retryCount: 3 })]);

    setQueuedPhotoUploadedUrl('p1', 'https://res.cloudinary.com/x/p1.jpg');

    const [entry] = getQueuedPhotos();
    expect(entry.uploadedUrl).toBe('https://res.cloudinary.com/x/p1.jpg');
    expect(entry.fileData).toBe('');
    expect(entry.retryCount).toBe(0);
  });

  it('queue-size eviction removes oldest non-uploaded entries before uploaded ones', async () => {
    const base = Date.now() - 100000;
    const entries: QueuedPhoto[] = [
      makeEntry({ id: 'oldest_uploaded', timestamp: base, uploadedUrl: 'https://res.cloudinary.com/x/u.jpg' }),
      ...Array.from({ length: 49 }, (_, i) =>
        makeEntry({ id: `pending_${i}`, timestamp: base + 1 + i })
      ),
    ];
    seedQueue(entries); // exactly at MAX_QUEUE_SIZE = 50

    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' });
    await queuePhoto(file, 'job-completion', { jobId: 'job-1', photoType: 'after' });

    const ids = getQueuedPhotos().map((p) => p.id);
    expect(ids).toContain('oldest_uploaded'); // protected despite being oldest
    expect(ids).not.toContain('pending_0'); // oldest non-uploaded evicted instead
    expect(ids.length).toBe(50);
  });
});

describe('retryPhotoUpload job-linking', () => {
  it("links an 'after' photo into after_photos and images (previously dropped)", async () => {
    seedQueue([
      makeEntry({
        id: 'after1',
        jobId: 'job-1',
        photoType: 'after',
        uploadedUrl: 'https://res.cloudinary.com/x/after1.jpg',
      }),
    ]);
    getByIdFullMock.mockResolvedValue({
      data: { id: 'job-1', requirements: [], after_photos: ['https://res.cloudinary.com/x/existing.jpg'], images: [] },
      error: null,
    });

    await processQueuedPhotos();

    expect(jobUpdateMock).toHaveBeenCalledTimes(1);
    const [jobId, payload] = jobUpdateMock.mock.calls[0];
    expect(jobId).toBe('job-1');
    expect(payload.after_photos).toEqual([
      'https://res.cloudinary.com/x/existing.jpg',
      'https://res.cloudinary.com/x/after1.jpg',
    ]);
    expect(payload.images).toEqual(['https://res.cloudinary.com/x/after1.jpg']);
    expect(payload.requirements).toBeUndefined();
    expect(getQueuedPhotos()).toHaveLength(0); // removed after successful link
  });

  it("links a 'before' photo into before_photos only", async () => {
    seedQueue([
      makeEntry({
        id: 'before1',
        jobId: 'job-2',
        photoType: 'before',
        uploadedUrl: 'https://res.cloudinary.com/x/before1.jpg',
      }),
    ]);
    getByIdFullMock.mockResolvedValue({
      data: { id: 'job-2', requirements: [], before_photos: [], images: [] },
      error: null,
    });

    await processQueuedPhotos();

    const [, payload] = jobUpdateMock.mock.calls[0];
    expect(payload.before_photos).toEqual(['https://res.cloudinary.com/x/before1.jpg']);
    expect(payload.after_photos).toBeUndefined();
  });

  it("still links 'bill' photos into requirements.bill_photos", async () => {
    seedQueue([
      makeEntry({
        id: 'bill1',
        jobId: 'job-3',
        photoType: 'bill',
        uploadedUrl: 'https://res.cloudinary.com/x/bill1.jpg',
      }),
    ]);
    getByIdFullMock.mockResolvedValue({
      data: { id: 'job-3', requirements: [{ bill_photos: ['https://res.cloudinary.com/x/old-bill.jpg'] }] },
      error: null,
    });

    await processQueuedPhotos();

    const [, payload] = jobUpdateMock.mock.calls[0];
    const requirements = JSON.parse(payload.requirements);
    const billReq = requirements.find((r: any) => r.bill_photos);
    expect(billReq.bill_photos).toEqual([
      'https://res.cloudinary.com/x/old-bill.jpg',
      'https://res.cloudinary.com/x/bill1.jpg',
    ]);
  });

  it('skips the DB write when the after photo is already linked, and clears the entry', async () => {
    seedQueue([
      makeEntry({
        id: 'dup1',
        jobId: 'job-4',
        photoType: 'after',
        uploadedUrl: 'https://res.cloudinary.com/x/dup.jpg',
      }),
    ]);
    getByIdFullMock.mockResolvedValue({
      data: {
        id: 'job-4',
        requirements: [],
        after_photos: ['https://res.cloudinary.com/x/dup.jpg'],
        images: ['https://res.cloudinary.com/x/dup.jpg'],
      },
      error: null,
    });

    await processQueuedPhotos();

    expect(jobUpdateMock).not.toHaveBeenCalled();
    expect(getQueuedPhotos()).toHaveLength(0);
  });

  it('keeps the queue entry when the job-link update fails', async () => {
    seedQueue([
      makeEntry({
        id: 'fail1',
        jobId: 'job-5',
        photoType: 'after',
        uploadedUrl: 'https://res.cloudinary.com/x/fail1.jpg',
      }),
    ]);
    getByIdFullMock.mockResolvedValue({
      data: { id: 'job-5', requirements: [], after_photos: [], images: [] },
      error: null,
    });
    jobUpdateMock.mockResolvedValue({ error: { message: 'RLS denied' } });

    await processQueuedPhotos();

    const queue = getQueuedPhotos();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('fail1');
    expect(queue[0].uploadedUrl).toBe('https://res.cloudinary.com/x/fail1.jpg');
  });

  it('uploads bytes first when there is no cached URL, then links', async () => {
    seedQueue([
      makeEntry({ id: 'up1', jobId: 'job-6', photoType: 'after' }),
    ]);
    uploadImageMock.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/x/up1.jpg',
      public_id: 'up1',
    });
    getByIdFullMock.mockResolvedValue({
      data: { id: 'job-6', requirements: [], after_photos: [], images: [] },
      error: null,
    });

    await processQueuedPhotos();

    expect(uploadImageMock).toHaveBeenCalledTimes(1);
    const [, payload] = jobUpdateMock.mock.calls[0];
    expect(payload.after_photos).toEqual(['https://res.cloudinary.com/x/up1.jpg']);
    expect(getQueuedPhotos()).toHaveLength(0);
  });
});
