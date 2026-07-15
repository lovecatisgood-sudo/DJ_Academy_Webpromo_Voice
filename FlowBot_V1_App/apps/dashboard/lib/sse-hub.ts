export type HubEvent =
  | { type: "message"; sequence: string; payload: unknown }
  | { type: "state"; payload: unknown };

type Listener = (event: HubEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeToConversation(conversationId: string, listener: Listener): () => void {
  const set = listeners.get(conversationId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(conversationId, set);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(conversationId);
  };
}

export function publishConversationEvent(conversationId: string, event: HubEvent): void {
  const set = listeners.get(conversationId);
  if (!set) return;
  for (const listener of set) listener(event);
}
