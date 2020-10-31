import { HandledPromise, E } from '@agoric/eventual-send';
import { makePromiseKit } from '@agoric/promise-kit';

// TODO: replace with the agoric-sdk implementation from Mark

const makeAsyncIterable = startP => {
  return harden({
    // eslint-disable-next-line no-use-before-define
    [Symbol.asyncIterator]: () => makeAsyncIterator(startP),
    /**
     * To manually create a local representative of a
     * this kind of remote async interable, do
     * ```js
     * localIterable = makeAsyncIterable(E(remoteIterable).getEventualList());
     * ```
     * The resulting localIterable also support such remote use, and
     * will return access to the same representation.
     */
    getEventualList: () => startP,
  });
};

const makeAsyncIterator = tailP => {
  return harden({
    snapshot: () => makeAsyncIterable(tailP),
    [Symbol.asyncIterator]: () => makeAsyncIterator(tailP),
    next: () => {
      const resultP = E.G(tailP).head;
      tailP = E.G(tailP).tail;
      return resultP;
    },
  });
};

export const makeAsyncIterableKit = () => {
  let rear;
  const asyncIterable = makeAsyncIterable(new HandledPromise(r => (rear = r)));

  const updater = harden({
    updateState: value => {
      if (rear === undefined) {
        throw new Error('Cannot update state after termination.');
      }
      const { promise: nextTailE, resolve: nextRear } = makePromiseKit();
      rear(harden({ head: { value, done: false }, tail: nextTailE }));
      rear = nextRear;
    },
    finish: finalValue => {
      if (rear === undefined) {
        throw new Error('Cannot finish after termination.');
      }
      const readComplaint = HandledPromise.reject(
        new Error('cannot read past end of iteration'),
      );
      rear({ head: { value: finalValue, done: true }, tail: readComplaint });
      rear = undefined;
    },
    fail: reason => {
      if (rear === undefined) {
        throw new Error('Cannot fail after termination.');
      }
      rear(HandledPromise.reject(reason));
      rear = undefined;
    },
  });
  return harden({ updater, asyncIterable });
};
harden(makeAsyncIterableKit);
