export interface TuiHistorySearchItem {
  readonly historyIndex: number;
  readonly value: string;
}

export function filterTuiInputHistory(history: readonly string[], query: string): TuiHistorySearchItem[] {
  const normalized = query.trim().toLowerCase();
  const seen = new Set<string>();
  return history
    .map((value, historyIndex) => ({ value, historyIndex }))
    .reverse()
    .filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return !normalized || item.value.toLowerCase().includes(normalized);
    })
    .sort((left, right) => {
      if (!normalized) return right.historyIndex - left.historyIndex;
      const leftPrefix = left.value.toLowerCase().startsWith(normalized) ? 0 : 1;
      const rightPrefix = right.value.toLowerCase().startsWith(normalized) ? 0 : 1;
      return (leftPrefix - rightPrefix) || (right.historyIndex - left.historyIndex);
    });
}
