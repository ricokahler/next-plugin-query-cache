import createPubSub from './create-pub-sub';

describe('createPubSub', () => {
  test('subscriptions and notifications', () => {
    const pubSub = createPubSub<string>();
    const handler = jest.fn();
    const unsubscribe = pubSub.subscribe(handler);

    pubSub.notify('first');
    pubSub.notify('second');

    unsubscribe();
    pubSub.notify('third');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "first",
        ],
        Array [
          "second",
        ],
      ]
    `);
  });
});
