import type { EventKind, ToolStreamEventMap, ToolStreamListener } from './types.js'

export class ToolStreamEmitter {
  private listeners = new Map<EventKind, Set<ToolStreamListener<any>>>()
  private onceListeners = new Map<EventKind, Set<ToolStreamListener<any>>>()

  on<E extends EventKind>(event: E, listener: ToolStreamListener<E>): this {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return this
  }

  once<E extends EventKind>(event: E, listener: ToolStreamListener<E>): this {
    let set = this.onceListeners.get(event)
    if (!set) {
      set = new Set()
      this.onceListeners.set(event, set)
    }
    set.add(listener)
    return this
  }

  off<E extends EventKind>(event: E, listener: ToolStreamListener<E>): this {
    this.listeners.get(event)?.delete(listener)
    this.onceListeners.get(event)?.delete(listener)
    return this
  }

  protected emitSync<E extends EventKind>(
    event: E,
    ...args: ToolStreamEventMap[E]
  ): void {
    const permanent = this.listeners.get(event)
    if (permanent) {
      for (const listener of permanent) {
        listener(...args)
      }
    }
    const once = this.onceListeners.get(event)
    if (once) {
      for (const listener of once) {
        listener(...args)
      }
      once.clear()
      this.onceListeners.delete(event)
    }
  }

  protected async emitAsync<E extends EventKind>(
    event: E,
    ...args: ToolStreamEventMap[E]
  ): Promise<void> {
    const promises: Promise<void>[] = []

    const permanent = this.listeners.get(event)
    if (permanent) {
      for (const listener of permanent) {
        const result = listener(...args)
        if (result instanceof Promise) promises.push(result)
      }
    }

    const once = this.onceListeners.get(event)
    if (once) {
      for (const listener of once) {
        const result = listener(...args)
        if (result instanceof Promise) promises.push(result)
      }
      once.clear()
      this.onceListeners.delete(event)
    }

    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }

  listenerCount(event: EventKind): number {
    return (this.listeners.get(event)?.size ?? 0) +
      (this.onceListeners.get(event)?.size ?? 0)
  }

  removeAllListeners(event?: EventKind): void {
    if (event) {
      this.listeners.delete(event)
      this.onceListeners.delete(event)
    } else {
      this.listeners.clear()
      this.onceListeners.clear()
    }
  }
}
