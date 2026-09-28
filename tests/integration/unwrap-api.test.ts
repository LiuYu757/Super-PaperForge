import { describe, it, expect } from 'vitest';
import { unwrapApi } from '@/lib/utils';

describe('unwrapApi', () => {
  it('unwraps { data: obj }', () => { expect(unwrapApi({ success: true, data: { id: '1' } })).toEqual({ id: '1' }); });
  it('unwraps { data: array }', () => { expect(unwrapApi({ data: [1, 2] })).toEqual([1, 2]); });
  it('unwraps { data: null }', () => { expect(unwrapApi({ data: null })).toBeNull(); });
  it('passes plain array', () => { expect(unwrapApi([1, 2])).toEqual([1, 2]); });
  it('passes plain object without data', () => { expect(unwrapApi({ id: '1' })).toEqual({ id: '1' }); });
  it('passes string', () => { expect(unwrapApi('test')).toBe('test'); });
  it('passes number', () => { expect(unwrapApi(42)).toBe(42); });
  it('passes null', () => { expect(unwrapApi(null)).toBeNull(); });
});
