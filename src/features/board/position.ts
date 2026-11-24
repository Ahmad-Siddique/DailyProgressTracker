import type { TaskRow } from "@/features/board/selectors";

function appendSuffix(value: string): string {
  return `${value}z`;
}

function ensureUnique(candidate: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  let next = candidate;
  let guard = 0;
  while (set.has(next) && guard < 64) {
    next = appendSuffix(next);
    guard += 1;
  }
  return next;
}

/** End of column — never reuses an existing position. */
export function positionAtEnd(positions: string[]): string {
  if (positions.length === 0) return "m";
  const sorted = [...positions].sort((a, b) => a.localeCompare(b));
  const last = sorted[sorted.length - 1]!;
  return ensureUnique(appendSuffix(last), positions);
}

function positionBeforeStrict(after: string, taken: string[]): string {
  if (after > "a") {
    const c = ensureUnique("a", taken);
    if (c < after) return c;
  }
  return ensureUnique(`!${after}`, taken);
}

/** Strictly between two positions (lexicographic), or open-ended. */
export function positionBetween(
  before: string | null,
  after: string | null,
  taken: string[],
): string {
  if (before === null && after === null) return positionAtEnd([]);
  if (before === null && after !== null) {
    return positionBeforeStrict(after, taken);
  }
  if (before !== null && after === null) {
    return positionAtEnd([...taken, before]);
  }
  if (before !== null && after !== null) {
    const set = new Set(taken);
    let probe = before;
    for (let guard = 0; guard < 48; guard++) {
      const candidate = `${probe}a`;
      if (candidate > before && candidate < after && !set.has(candidate)) {
        return candidate;
      }
      if (candidate >= after) break;
      probe = candidate;
    }
    let extended = before;
    for (let guard = 0; guard < 48; guard++) {
      extended = appendSuffix(extended);
      if (extended < after && !set.has(extended)) return extended;
      if (extended >= after) break;
    }
    return positionBeforeStrict(after, taken);
  }
  return positionAtEnd(taken);
}

export function positionForColumnDrop(
  columnTasks: TaskRow[],
  activeId: string,
): string {
  const others = columnTasks.filter((t) => t.id !== activeId);
  return positionAtEnd(others.map((t) => t.position));
}

export function positionForReorder(
  columnTasks: TaskRow[],
  activeId: string,
  overId: string,
): string | null {
  const sorted = [...columnTasks].sort((a, b) =>
    a.position.localeCompare(b.position),
  );
  const from = sorted.findIndex((t) => t.id === activeId);
  const over = sorted.findIndex((t) => t.id === overId);
  if (from < 0 || over < 0 || from === over) return null;

  const without = sorted.filter((t) => t.id !== activeId);
  const overIdx = without.findIndex((t) => t.id === overId);
  const overRow = overIdx >= 0 ? without[overIdx] : undefined;
  if (!overRow) return null;

  const taken = without.map((t) => t.position);

  if (from < over) {
    const afterNeighbor = without[overIdx + 1]?.position ?? null;
    return positionBetween(overRow.position, afterNeighbor, taken);
  }
  const beforeNeighbor = without[overIdx - 1]?.position ?? null;
  return positionBetween(beforeNeighbor, overRow.position, taken);
}