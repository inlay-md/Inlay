// SPDX-License-Identifier: Apache-2.0
/** Minimal typed event emitter shared by Host implementations. */
export class Emitter<Events> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => {
      set?.delete(handler as (payload: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) (handler as (payload: Events[K]) => void)(payload);
  }

  listenerCount(event: keyof Events): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
