function createPubSub<T = void>(initialValue: T) {
  type Listener = (t: T) => void;
  const listeners = new Set<Listener>();
  const value = { current: initialValue };

  function subscribe(listener: Listener) {
    listeners.add(listener);

    const unsubscribe = () => {
      listeners.delete(listener);
    };

    return unsubscribe;
  }

  function notify(t: T) {
    value.current = t;

    for (const listener of listeners) {
      listener(t);
    }
  }

  function getCurrent() {
    return value.current;
  }

  return { subscribe, notify, getCurrent };
}

export default createPubSub;
