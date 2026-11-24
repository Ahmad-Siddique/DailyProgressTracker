const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: string): string {
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function csvRow(cells: string[]): string {
  return cells
    .map((c) => {
      const safe = sanitizeCsvCell(c);
      if (/[",\n]/.test(safe)) {
        return `"${safe.replace(/"/g, '""')}"`;
      }
      return safe;
    })
    .join(",");
}