import { supabase } from '@/lib/supabaseClient';

export const TECHNICIAN_REVIEWS_PAGE_SIZE = 10;

export type TechnicianReview = {
  id: string;
  jobId: string;
  brand: 'hydrogenro' | 'elevenro';
  rating: number;
  comment: string;
  submittedAt: string;
};

export type TechnicianReviewsPage = {
  reviews: TechnicianReview[];
  total: number;
};

export async function fetchTechnicianReviewsPage(
  technicianId: string,
  page: number
): Promise<TechnicianReviewsPage> {
  const id = String(technicianId || '').trim();
  if (!id) throw new Error('Technician is not available');

  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const from = (safePage - 1) * TECHNICIAN_REVIEWS_PAGE_SIZE;
  const to = from + TECHNICIAN_REVIEWS_PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('job_reviews')
    .select('id, job_id, brand, rating, comment, submitted_at', { count: 'exact' })
    .eq('technician_id', id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message || 'Could not load reviews');

  const reviews = (Array.isArray(data) ? data : []).flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    const rating = Number(row.rating);
    const submittedAt = String(row.submitted_at || '');
    if (!row.id || !Number.isInteger(rating) || rating < 1 || rating > 5 || !submittedAt) {
      return [];
    }
    return [{
      id: String(row.id),
      jobId: String(row.job_id || ''),
      brand: row.brand === 'elevenro' ? 'elevenro' : 'hydrogenro',
      rating,
      comment: String(row.comment || '').trim(),
      submittedAt,
    } satisfies TechnicianReview];
  });

  return { reviews, total: Math.max(0, Number(count) || 0) };
}
