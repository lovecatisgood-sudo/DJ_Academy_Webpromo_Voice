import { describe, expect, it } from "vitest";
import { emptyDefinitionHistory, recordDefinition, redoDefinition, undoDefinition } from "./definition-history";

describe("FlowBot definition history", () => {
  it("undoes and redoes without changing the recorded values", () => {
    const first = { revision: "first" };
    const second = { revision: "second" };
    const third = { revision: "third" };
    const history = recordDefinition(recordDefinition(emptyDefinitionHistory<typeof first>(), first), second);

    const undone = undoDefinition(history, third)!;
    expect(undone.value).toBe(second);
    expect(undone.history).toEqual({ past: [first], future: [third] });

    const redone = redoDefinition(undone.history, second)!;
    expect(redone.value).toBe(third);
    expect(redone.history).toEqual({ past: [first, second], future: [] });
  });

  it("clears redo after a new edit and caps retained history", () => {
    const history = { past: [{ value: 1 }], future: [{ value: 3 }] };
    expect(recordDefinition(history, { value: 2 }, 2)).toEqual({
      past: [{ value: 1 }, { value: 2 }],
      future: [],
    });
    const capped = [1, 2, 3, 4].reduce(
      (value, current) => recordDefinition(value, { value: current }, 3),
      emptyDefinitionHistory<{ value: number }>(),
    );
    expect(capped.past.map((item) => item.value)).toEqual([2, 3, 4]);
  });

  it("fails closed when no reversible state exists", () => {
    const empty = emptyDefinitionHistory<{ value: number }>();
    expect(undoDefinition(empty, { value: 1 })).toBeNull();
    expect(redoDefinition(empty, { value: 1 })).toBeNull();
  });
});
