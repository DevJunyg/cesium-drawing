export type Listener<P> = (payload: P) => void;
export type Unsubscribe = () => void;

export class TypedEmitter<EventMap extends Record<string, unknown>> {
  private _listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): Unsubscribe {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      this._listeners.get(event)?.delete(listener as Listener<unknown>);
    };
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this._listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // listener 가 unsubscribe 를 호출해도 안전하도록 snapshot
    const snapshot = Array.from(set);
    for (const listener of snapshot) {
      try {
        (listener as Listener<EventMap[K]>)(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[TypedEmitter] listener for "${String(event)}" threw:`, err);
      }
    }
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event === undefined) this._listeners.clear();
    else this._listeners.get(event)?.clear();
  }

  listenerCount<K extends keyof EventMap>(event: K): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}
