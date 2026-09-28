import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetcher } from '@/lib/fetcher';

describe('fetcher response unwrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps { data: [...] }', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [1, 2] }), { status: 200 }),
    );

    return expect(fetcher('/api/test')).resolves.toEqual([1, 2]);
  });
  it('passes through plain array', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([1, 2]), { status: 200 }),
    );

    return expect(fetcher('/api/test')).resolves.toEqual([1, 2]);
  });
  it('unwraps { data: null }', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: null }), { status: 200 }),
    );

    return expect(fetcher('/api/test')).resolves.toBeNull();
  });
  it('passes through plain object', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), { status: 200 }),
    );

    return expect(fetcher('/api/test')).resolves.toEqual({ id: '1' });
  });
  it('throws normalized message from standardized api error payload', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Rate limited' } }),
        {
          status: 429,
          statusText: 'Too Many Requests',
        },
      ),
    );

    return expect(fetcher('/api/test')).rejects.toThrow('Rate limited (429)');
  });
  it('throws plain error field when standardized error is string', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: 'Token expired' }),
        { status: 401, statusText: 'Unauthorized' },
      ),
    );

    return expect(fetcher('/api/test')).rejects.toThrow('Token expired (401)');
  });
  it('falls back to generic error on transport-level HTTP failure', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'broken' }), { status: 500, statusText: 'Server Error' }),
    );

    return expect(fetcher('/api/test')).rejects.toThrow('broken (500)');
  });

  it('falls back to status-based message when body has no API error message', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 502, statusText: 'Bad Gateway' }),
    );

    return expect(fetcher('/api/test')).rejects.toThrow('API error: 502 Bad Gateway');
  });

  it('falls back when response body is not JSON', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 503, statusText: 'Service Unavailable' }),
    );

    return expect(fetcher('/api/test')).rejects.toThrow('API error: 503 Service Unavailable');
  });
});
