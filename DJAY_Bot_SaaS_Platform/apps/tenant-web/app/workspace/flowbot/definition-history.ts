export type DefinitionHistory<T> = Readonly<{
  past: readonly T[];
  future: readonly T[];
}>;

export const emptyDefinitionHistory = <T>(): DefinitionHistory<T> => ({ past: [], future: [] });

export function recordDefinition<T>(
  history: DefinitionHistory<T>,
  current: T,
  limit = 100,
): DefinitionHistory<T> {
  const boundedLimit = Math.max(1, Math.floor(limit));
  return {
    past: [...history.past, current].slice(-boundedLimit),
    future: [],
  };
}

export function undoDefinition<T>(
  history: DefinitionHistory<T>,
  current: T,
): Readonly<{ history: DefinitionHistory<T>; value: T } | null> {
  const value = history.past.at(-1);
  if (value === undefined) return null;
  return {
    value,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
  };
}

export function redoDefinition<T>(
  history: DefinitionHistory<T>,
  current: T,
): Readonly<{ history: DefinitionHistory<T>; value: T } | null> {
  const value = history.future[0];
  if (value === undefined) return null;
  return {
    value,
    history: {
      past: [...history.past, current],
      future: history.future.slice(1),
    },
  };
}
