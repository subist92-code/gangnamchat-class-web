/**
 * CSV 유틸 — 규격 §2-2·§4-2: UTF-8 BOM(엑셀 호환) · 구분자 쉼표 · 첫 행 헤더 고정.
 * 붙여넣기 입력은 TSV 도 받는다(리-1 · R0).
 */

export const BOM = '\uFEFF';

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch ?? '';
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** 쉼표·탭 중 첫 줄에 더 많은 쪽을 구분자로 고른다 */
export function detectDelimiter(text: string): string {
  const first = stripBom(text).split(/\r?\n/)[0] ?? '';
  const commas = (first.match(/,/g) ?? []).length;
  const tabs = (first.match(/\t/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): ParsedCsv {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [], delimiter };
  const header = splitLine(lines[0] as string, delimiter);
  const rows = lines.slice(1).map((line) => splitLine(line, delimiter));
  return { header, rows, delimiter };
}

function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** UTF-8 BOM 포함 CSV 문자열 */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
