import { describe, expect, it } from 'vitest';
import { fileStamp, filenameWord, stampedFileName } from './xlsx';

describe('tracking download names', () => {
  it('stamps day-first, with the time, zero-padded', () => {
    expect(fileStamp(new Date(2026, 10, 5, 10, 57, 5))).toBe('05_11_2026_10_57_05');
  });

  it('turns a status key or name into one word', () => {
    expect(filenameWord('in_transit')).toBe('InTransit');
    expect(filenameWord('CLEARING COMPLETED')).toBe('ClearingCompleted');
    expect(filenameWord('CLEARED WITH IR')).toBe('ClearedWithIr');
  });

  it('joins the parts and the stamp, dropping anything unsafe', () => {
    expect(stampedFileName(['MultiClient', 'All', 'Exports'])).toMatch(/^MultiClient_All_Exports_\d{2}_\d{2}_\d{4}_\d{2}_\d{2}_\d{2}\.xlsx$/u);
    expect(stampedFileName(['B/N:F', 'InTransit-Completed', 'Imports'])).toMatch(/^BNF_InTransit-Completed_Imports_/u);
  });
});
