function createPubSub<T = void>() {
  type Listener = (t: T) => void;
  const listeners = new Set<Listener>();

  function subscribe(listener: Listener) {
    listeners.add(listener);

    const unsubscribe = () => {
      listeners.delete(listener);
    };

    return unsubscribe;
  }

  function notify(t: T) {
    for (const listener of listeners) {
      listener(t);
    }
  }

  return { subscribe, notify };
}

export default createPubSub;
