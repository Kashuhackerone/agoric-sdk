import { assert, details as d, quote as q } from '@agoric/assert';
import { parseVatSlot } from '../parseVatSlots';

const initializationInProgress = Symbol('initializing');

/**
 * Make a simple LRU cache of virtual object inner selves.
 *
 * @param {number} size  Maximum number of entries to keep in the cache before
 *    starting to throw them away.
 * @param {(vobjID: string) => Object} fetch  Function to retrieve an
 *    object's raw state from the store by its vobjID
 * @param {(vobjID: string, rawData: Object) => void} store  Function to
 *   store raw object state by its vobjID
 *
 * @returns {Object}  An LRU cache of (up to) the given size
 *
 * This cache is part of the virtual object manager and is not intended to be
 * used independently; it is exported only for the benefit of test code.
 */
export function makeCache(size, fetch, store) {
  let lruHead;
  let lruTail;
  const liveTable = new Map();

  const cache = {
    makeRoom() {
      while (liveTable.size > size && lruTail) {
        if (lruTail.rawData[initializationInProgress]) {
          let refreshCount = 1;
          while (lruTail.rawData[initializationInProgress]) {
            if (refreshCount > size) {
              throw Error(`cache overflowed with objects being initialized`);
            }
            cache.refresh(lruTail);
            refreshCount += 1;
          }
        }
        liveTable.delete(lruTail.vobjID);
        store(lruTail.vobjID, lruTail.rawData);
        lruTail.rawData = null;
        if (lruTail.prev) {
          lruTail.prev.next = undefined;
        } else {
          lruHead = undefined;
        }
        lruTail = lruTail.prev;
      }
    },
    flush() {
      const saveSize = size;
      size = 0;
      cache.makeRoom();
      size = saveSize;
    },
    remember(innerObj) {
      if (liveTable.has(innerObj.vobjID)) {
        return;
      }
      cache.makeRoom();
      liveTable.set(innerObj.vobjID, innerObj);
      innerObj.prev = undefined;
      innerObj.next = lruHead;
      if (lruHead) {
        lruHead.prev = innerObj;
      }
      lruHead = innerObj;
      if (!lruTail) {
        lruTail = innerObj;
      }
    },
    refresh(innerObj) {
      if (innerObj !== lruHead) {
        const oldPrev = innerObj.prev;
        const oldNext = innerObj.next;
        if (oldPrev) {
          oldPrev.next = oldNext;
        } else {
          lruHead = oldNext;
        }
        if (oldNext) {
          oldNext.prev = oldPrev;
        } else {
          lruTail = oldPrev;
        }
        innerObj.prev = undefined;
        innerObj.next = lruHead;
        lruHead.prev = innerObj;
        lruHead = innerObj;
      }
    },
    lookup(vobjID) {
      let innerObj = liveTable.get(vobjID);
      if (innerObj) {
        cache.refresh(innerObj);
      } else {
        innerObj = { vobjID, rawData: fetch(vobjID) };
        cache.remember(innerObj);
      }
      return innerObj;
    },
  };
  return cache;
}

/**
 * Create a new virtual object manager.  There is one of these for each vat.
 *
 * @param {*} syscall  Vat's syscall object, used to access the `vatstoreGet`
 *   and `vatstoreSet` operations.
 * @param {() => number} allocateExportID  Function to allocate the next object
 *   export ID for the enclosing vat.
 * @param {*} valToSlotTable  The vat's table that maps object identities to
 *   their corresponding export IDs
 * @param {*} m The vat's marshaler.
 * @param {number} cacheSize How many virtual objects this manager should cache
 *   in memory.
 * @returns {*} a new virtual object manager.
 *
 * The virtual object manager allows the creation of persistent objects that do
 * not need to occupy memory when they are not in use.  It provides four
 * functions:
 *
 * - `makeKind` enables users to define new types of virtual object by providing
 *    an implementation of the new kind of object's behavior.  The result is a
 *    maker function that will produce new virtualized instances of the defined
 *    object type on demand.
 *
 * - `makeWeakStore` creates an instance of WeakStore that can be keyed by these
     virtual objects.
 *
 * - `flushCache` will empty the object manager's cache of in-memory object
 *    instances, writing any changed state to the persistent store.  This
 *    provided for testing; it otherwise has little use.
 *
 * - `makeVirtualObjectRepresentation` will provide a useeable, in-memory
 *    version of a virtual object, given its vat slot ID.  This is used when
 *    deserializing a reference to an object that has been received in a message
 *    or is part of the persistent state of another virtual object that is being
 *    swapped in from storage.
 *
 * `makeKind` and `makeWeakStore` are made available to user vat code as
 * globals.  The other two methods are for internal use by liveslots.
 */
export function makeVirtualObjectManager(
  syscall,
  allocateExportID,
  valToSlotTable,
  m,
  cacheSize,
) {
  /**
   * Fetch an object's state from secondary storage.
   *
   * @param {string} vobjID  The virtual object ID of the object whose state is
   *    being fetched.
   * @returns {*} an object representing the object's stored state.
   */
  function fetch(vobjID) {
    return JSON.parse(syscall.vatstoreGet(vobjID));
  }

  /**
   * Write an object's state to secondary storage.
   *
   * @param {string} vobjID  The virtual object ID of the object whose state is
   *    being stored.
   * @param {*} rawData  A data object representing the state to be written.
   */
  function store(vobjID, rawData) {
    syscall.vatstoreSet(vobjID, JSON.stringify(rawData));
  }

  const cache = makeCache(cacheSize, fetch, store);

  /**
   * Map from virtual object kind IDs to reanimator functions for the
   * corresponding kinds of virtual objects.
   */
  const kindTable = new Map();

  /**
   * Produce a representative given a virtual object ID.  Used for
   * deserializing.
   *
   * @param {string} vobjID  The virtual object ID of the object being dereferenced
   *
   * @returns {Object}  A representative of the object identified by `vobjID`
   */
  function makeVirtualObjectRepresentative(vobjID) {
    const { id } = parseVatSlot(vobjID);
    const kindID = `${id}`;
    const reanimator = kindTable.get(kindID);
    if (reanimator) {
      return reanimator(vobjID);
    } else {
      throw Error(`unknown kind ${kindID}`);
    }
  }

  let nextWeakStoreID = 1;

  /**
   * This is essentially a copy of makeWeakStore from the @agoric/store package,
   * modified to key a virtual object representative using its virtual object ID
   * (rather than its object identity) and stash the corresponding value in
   * persistent storage.  Note this means that (1) non-virtual objects all
   * continue to be tracked in an in-memory WeakMap, meaning the keys are held
   * weakly but table size is bounded by memory capacity, while (2) virtual
   * objects are not actually held weakly and so will never (at this point) be
   * garbage collected since there's no way to tell when they keys become
   * unreferenced.
   *
   * This should be considered a placeholder for developmental purposes.  It is
   * not integrated with the regular @agoric/store package in a general way.
   *
   * @template {Record<any, any>} K
   * @template {any} V
   *
   * @param {string} [keyName='key']
   *
   * @returns {WeakStore<K, V>}
   */
  function makeWeakStore(keyName = 'key') {
    const backingMap = new WeakMap();
    const storeID = nextWeakStoreID;
    nextWeakStoreID += 1;

    function assertKeyDoesNotExist(key) {
      assert(!backingMap.has(key), d`${q(keyName)} already registered: ${key}`);
    }

    function assertKeyExists(key) {
      assert(backingMap.has(key), d`${q(keyName)} not found: ${key}`);
    }

    function virtualObjectKey(key) {
      const vobjID = valToSlotTable.get(key);
      if (!vobjID) {
        return undefined;
      } else {
        const { type, virtual } = parseVatSlot(vobjID);
        if (type === 'object' && virtual) {
          return `ws${storeID}.${vobjID}`;
        } else {
          return undefined;
        }
      }
    }

    return harden({
      has(key) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          return !!syscall.vatstoreGet(vkey);
        } else {
          return backingMap.has(key);
        }
      },
      init(key, value) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          assert(
            !syscall.vatstoreGet(vkey),
            d`${q(keyName)} already registered: ${key}`,
          );
          syscall.vatstoreSet(vkey, JSON.stringify(m.serialize(value)));
        } else {
          assertKeyDoesNotExist(key);
          backingMap.set(key, value);
        }
      },
      get(key) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          const rawValue = syscall.vatstoreGet(vkey);
          assert(rawValue, d`${q(keyName)} not found: ${key}`);
          return m.unserialize(JSON.parse(rawValue));
        } else {
          assertKeyExists(key);
          return backingMap.get(key);
        }
      },
      set(key, value) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          assert(syscall.vatstoreGet(vkey), d`${q(keyName)} not found: ${key}`);
          syscall.vatstoreSet(vkey, JSON.stringify(m.serialize(harden(value))));
        } else {
          assertKeyExists(key);
          backingMap.set(key, value);
        }
      },
      delete(key) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          assert(syscall.vatstoreGet(vkey), d`${q(keyName)} not found: ${key}`);
          syscall.vatstoreSet(vkey, undefined);
        } else {
          assertKeyExists(key);
          backingMap.delete(key);
        }
      },
    });
  }

  /**
   * Make a new kind of virtual object.
   *
   * @param {*} instanceMaker  A function of the form `instanceMaker(state)` that
   *    will return a representative instance wrapped around the given state.
   *
   * @returns {*} a maker function that can be called to manufacture new
   *    instance of this kind of object.  The parameters of the maker function
   *    are those of the `initialize` method implemented in the representative
   *    produced by the `instanceMaker` parameter.
   *
   * Notes on theory of operation:
   *
   * Virtual objects are structured in three layers: representatives, inner
   * selves, and state data.
   *
   * A representative is the manifestation of a virtual object that vat code has
   * direct access to.  A given virtual object can have multiple
   * representatives: one is created when the instance is initially made and
   * another is generated each time the instance's virtual object ID is
   * deserialized, either when delivered as part of an incoming message or read
   * as part of another virtual object's state.  These representatives are not
   * === but do obey the `sameKey` equivalence relation.  In particular, methods
   * invoked on them all operate on the same underyling virtual object state.  A
   * representative is garbage collectable once it becomes unreferenced in the
   * vat.
   *
   * The inner self represents the in-memory information about an object, aside
   * from its state.  There is an inner self for each virtual object that is
   * currently resident in memory; that is, there is an inner self for each
   * virtual object for which there is currently at least one representative
   * present somewhere in the vat.  The inner self maintains two pieces of
   * information: its corresponding virtual object's virtual object ID, and a
   * pointer to the virtual object's state in memory if the virtual object's
   * state is, in fact, currently resident in memory.  If the state is not in
   * memory, the inner self's pointer to the state is null.  In addition, the
   * virtual object manager maintains an LRU cache of inner selves.  Inner
   * selves that are in the cache are not necessarily referenced by any existing
   * representative, but are available to be used should such a representative
   * be needed.  How this all works will be explained in a moment.
   *
   * The state of a virtual object is a collection of mutable properties, each
   * of whose values is itself immutable and serializable.  The methods of a
   * virtual object have access to this state by closing over a state object.
   * However, the state object they close over is not the actual state object,
   * but a wrapper with accessor methods that both ensure that a representation
   * of the state is in memory when needed and perform deserialization on read
   * and serialization on write; this wrapper is held by the representative, so
   * that method invocations always see the wrapper belonging to the invoking
   * representative.  The actual state object holds marshaled serializations of
   * each of the state properties.  When written to persistent storage, this is
   * representated as a JSON-stringified object each of whose properties is one
   * of the marshaled property values.
   *
   * When a method of a virtual object attempts to access one of the properties
   * of the object's state, the accessor first checks to see if the state is in
   * memory.  If it is not, it is loaded from persistent storage, the
   * corresponding inner self is made to point at it, and then the inner self is
   * placed at the head of the LRU cache (causing the least recently used inner
   * self to fall off the end of the cache).  If it *is* memory, it is promoted
   * to the head of the LRU cache but the contents of the cache remains
   * unchanged.  When an inner self falls off the end of the LRU, its reference
   * to the state is nulled out and the object holding the state becomes garbage
   * collectable.
   */
  function makeKind(instanceMaker) {
    const kindID = `${allocateExportID()}`;
    let nextInstanceID = 1;

    function makeRepresentative(innerSelf, initializing) {
      function ensureState() {
        if (!innerSelf.rawData) {
          innerSelf = cache.lookup(innerSelf.vobjID);
        }
      }

      function wrapData(target) {
        assert(
          !target[initializationInProgress],
          `object is still being initialized`,
        );
        for (const prop of Object.getOwnPropertyNames(innerSelf.rawData)) {
          Object.defineProperty(target, prop, {
            get: () => {
              ensureState(innerSelf);
              return m.unserialize(innerSelf.rawData[prop]);
            },
            set: value => {
              const serializedValue = m.serialize(value);
              ensureState(innerSelf);
              innerSelf.rawData[prop] = serializedValue;
            },
          });
        }
        innerSelf.wrapData = undefined;
        harden(target);
      }

      let representative;
      if (initializing) {
        innerSelf.wrapData = wrapData;
        representative = instanceMaker(innerSelf.rawData);
      } else {
        const activeData = {};
        wrapData(activeData);
        representative = instanceMaker(activeData);
        delete representative.initialize;
        harden(representative);
      }
      cache.remember(innerSelf);
      valToSlotTable.set(representative, innerSelf.vobjID);
      return representative;
    }

    function reanimate(vobjID) {
      return makeRepresentative(cache.lookup(vobjID), false);
    }
    kindTable.set(kindID, reanimate);

    function makeNewInstance(...args) {
      const vobjID = `o+${kindID}/${nextInstanceID}`;
      nextInstanceID += 1;

      const initialData = {};
      Object.defineProperty(initialData, initializationInProgress, {
        configurable: true,
        enumerable: false,
        writeable: false,
        value: true,
      });
      const innerSelf = { vobjID, rawData: initialData };
      const initialRepresentative = makeRepresentative(innerSelf, true);
      const initialize = initialRepresentative.initialize;
      if (initialize) {
        delete initialRepresentative.initialize;
        initialize(...args);
      }
      delete initialData[initializationInProgress];
      const rawData = {};
      for (const prop of Object.getOwnPropertyNames(initialData)) {
        try {
          rawData[prop] = m.serialize(initialData[prop]);
        } catch (e) {
          console.error(`state property ${prop} is not serializable`);
          throw e;
        }
      }
      innerSelf.rawData = rawData;
      innerSelf.wrapData(initialData);
      return initialRepresentative;
    }

    return makeNewInstance;
  }

  return harden({
    makeWeakStore,
    makeKind,
    flushCache: cache.flush,
    makeVirtualObjectRepresentative,
  });
}
