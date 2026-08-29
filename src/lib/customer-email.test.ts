import { describe, expect, it } from 'vitest';
import { seedEmailsForDocumentSend } from './customer-email';

describe('seedEmailsForDocumentSend', () => {
  it('prefers customer emails and skips placeholders', () => {
    expect(
      seedEmailsForDocumentSend(
        ['nomail@mail.com'],
        '  a@hydrogenro.com  ',
        'no@mail.com'
      )
    ).toEqual(['a@hydrogenro.com']);
  });

  it('falls back through sources without duplicates', () => {
    expect(seedEmailsForDocumentSend([], null, 'Same@X.com', 'same@x.com')).toEqual([
      'Same@X.com',
    ]);
  });
});
