import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseRefSheet } from './xlsxRead';

// Every case here came from a real shape of file an operator pastes together:
// a header or not, mixed-case repeats, blank rows, and both number conventions.

async function sheet(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Refs');
  for (const r of rows) ws.addRow(r);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('parseRefSheet', () => {
  it('reads reference and amount from the first two columns', async () => {
    const out = await parseRefSheet(await sheet([['TCL-EDCOR26-0010', 10], ['TCL-EDCOR26-0011', 20]]));
    expect(out.lines).toEqual([
      { ref: 'TCL-EDCOR26-0010', amount: 10 },
      { ref: 'TCL-EDCOR26-0011', amount: 20 },
    ]);
    expect(out.headerSkipped).toBe(false);
  });

  it('skips a header row when it sees one', async () => {
    const out = await parseRefSheet(await sheet([['MCA Reference', 'Amount'], ['A-1', 5]]));
    expect(out.headerSkipped).toBe(true);
    expect(out.lines).toEqual([{ ref: 'A-1', amount: 5 }]);
  });

  it('keeps the first row when it is data, not a header', async () => {
    // The costly mistake is the other way round: dropping a real reference.
    const out = await parseRefSheet(await sheet([['A-1', 5], ['A-2', 6]]));
    expect(out.headerSkipped).toBe(false);
    expect(out.lines).toHaveLength(2);
  });

  it('drops a repeat of the same reference regardless of case', async () => {
    const out = await parseRefSheet(await sheet([['A-1', 5], ['a-1', 999]]));
    expect(out.lines).toEqual([{ ref: 'A-1', amount: 5 }]);
    expect(out.duplicates).toBe(1);
  });

  it('drops rows with no reference and counts them', async () => {
    const out = await parseRefSheet(await sheet([['A-1', 5], ['', 50]]));
    expect(out.lines).toHaveLength(1);
    expect(out.blank).toBe(1);
  });

  it('reads a French-formatted amount — space grouping, comma decimal', async () => {
    // This is a DRC operation; '1 234,56' and '2,500.75' reach the same column.
    const out = await parseRefSheet(await sheet([['A-1', '1 234,56'], ['A-2', '2,500.75']]));
    expect(out.lines[0].amount).toBe(1234.56);
    expect(out.lines[1].amount).toBe(2500.75);
  });

  it('treats a missing amount as zero rather than NaN', async () => {
    const out = await parseRefSheet(await sheet([['A-1'], ['A-2', 'not a number']]));
    expect(out.lines).toEqual([
      { ref: 'A-1', amount: 0 },
      { ref: 'A-2', amount: 0 },
    ]);
  });

  it('rejects a file that is not a workbook', async () => {
    const junk = new TextEncoder().encode('this is not a spreadsheet').buffer as ArrayBuffer;
    await expect(parseRefSheet(junk)).rejects.toBeTruthy();
  });
});
