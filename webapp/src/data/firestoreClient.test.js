import { describe, it, expect, vi } from 'vitest';
import { loadAllWithRetry, writeWithRetry, collectionForKey, docsToDb, buildDocPayload } from './firestoreClient.js';

describe('docsToDb', () => {
  it('parses each document\'s JSON value into the output object, keyed by document id', () => {
    const docs = [
      { id: 'mkg:week:a', data: () => ({ value: JSON.stringify({ id: 'a' }) }) },
      { id: 'mkg:week:b', data: () => ({ value: JSON.stringify({ id: 'b' }) }) },
    ];
    expect(docsToDb(docs)).toEqual({ 'mkg:week:a': { id: 'a' }, 'mkg:week:b': { id: 'b' } });
  });

  it('skips a document whose value is not valid JSON, without throwing', () => {
    const docs = [
      { id: 'mkg:week:a', data: () => ({ value: 'not json' }) },
      { id: 'mkg:week:b', data: () => ({ value: JSON.stringify({ id: 'b' }) }) },
    ];
    expect(docsToDb(docs)).toEqual({ 'mkg:week:b': { id: 'b' } });
  });

  it('returns an empty object for an empty document list', () => {
    expect(docsToDb([])).toEqual({});
  });
});

describe('loadAllWithRetry', () => {
  it('returns the first result immediately when it is non-empty', async () => {
    const loadOnce = vi.fn().mockResolvedValue({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
    expect(loadOnce).toHaveBeenCalledTimes(1);
  });

  it('retries once and returns the second result when the first is empty', async () => {
    const loadOnce = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
    expect(loadOnce).toHaveBeenCalledTimes(2);
  });

  it('retries once and returns the second result when the first is null', async () => {
    const loadOnce = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
  });

  it('returns an empty object if both attempts are empty', async () => {
    const loadOnce = vi.fn().mockResolvedValue({});
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({});
    expect(loadOnce).toHaveBeenCalledTimes(2);
  });
});

describe('collectionForKey', () => {
  it('routes pdfchunk keys to the mkg_pdfchunks collection', () => {
    expect(collectionForKey('mkg:pdfchunk:abc123:0')).toBe('mkg_pdfchunks');
  });

  it('routes every other key to the main mkg_data collection', () => {
    expect(collectionForKey('mkg:presentation:abc123')).toBe('mkg_data');
    expect(collectionForKey('mkg:week:w1')).toBe('mkg_data');
    expect(collectionForKey('mkg:market:w1:idx1')).toBe('mkg_data');
  });
});

describe('writeWithRetry', () => {
  it('resolves without retrying when the write succeeds on the first attempt', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    await writeWithRetry(writeFn, 2, 0);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure and succeeds on a later attempt', async () => {
    const writeFn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    await writeWithRetry(writeFn, 2, 0);
    expect(writeFn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once retries are exhausted', async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    await expect(writeWithRetry(writeFn, 2, 0)).rejects.toThrow('persistent failure');
    expect(writeFn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('defaults to 2 retries when not specified', async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(writeWithRetry(writeFn, undefined, 0)).rejects.toThrow();
    expect(writeFn).toHaveBeenCalledTimes(3);
  });
});

describe('buildDocPayload', () => {
  it('adds gen = current + 1 on portfolio rows, as the Firestore rules require', () => {
    expect(buildDocPayload('mkg:portfolio:abc', { a: 1 }, 41, 'TS')).toEqual({ value: '{"a":1}', updatedAt: 'TS', gen: 42 });
  });

  it('starts a brand-new portfolio row at gen 1', () => {
    expect(buildDocPayload('mkg:portfolio:abc', {}, undefined, 'TS').gen).toBe(1);
  });

  it('never adds gen to any other document', () => {
    expect(buildDocPayload('mkg:content:entreprises:w1:x', { a: 1 }, 5, 'TS')).toEqual({ value: '{"a":1}', updatedAt: 'TS' });
    expect(buildDocPayload('mkg:portfolio-region:asie', {}, 5, 'TS')).not.toHaveProperty('gen');
  });
});
