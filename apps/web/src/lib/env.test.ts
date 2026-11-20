import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from './env';

describe('public API configuration', () => {
  it('defaults to the page origin for the development proxy or same-origin deployment', () => {
    expect(resolveApiBaseUrl(undefined, 'https://studypal.example')).toBe(
      'https://studypal.example',
    );
  });

  it('normalizes an explicit API origin', () => {
    expect(resolveApiBaseUrl('https://api.studypal.example/', 'https://studypal.example')).toBe(
      'https://api.studypal.example',
    );
  });

  it.each([
    'javascript:alert(1)',
    'https://user:secret@api.example',
    'https://api.example/api',
    'https://api.example?token=secret',
    'https://api.example#fragment',
    '/api',
  ])('rejects unsafe or ambiguous API origins: %s', (value) => {
    expect(() => resolveApiBaseUrl(value, 'https://studypal.example')).toThrow();
  });
});
