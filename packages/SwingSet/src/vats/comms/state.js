/* global harden */
import { assert, details } from '@agoric/assert';
import { insistCapData } from '../../capdata';
import { makeVatSlot } from '../../parseVatSlots';
import { insistRemoteID } from './remote';

const COMMS = 'comms';
const KERNEL = 'kernel';

export function makeState() {
  const state = {
    nextRemoteIndex: 1,
    remotes: new Map(), // remoteNN -> { remoteID, name, fromRemote/toRemote, etc }
    names: new Map(), // name -> remoteNN

    nextObjectIndex: 10,
    remoteReceivers: new Map(), // o+NN -> remoteNN, for admin rx objects
    objectTable: new Map(), // o+NN -> owning remote for non-admin objects

    // hopefully we can avoid the need for local promises
    // localPromises: new Map(), // p+NN/p-NN -> local purpose
    promiseTable: new Map(),
    // p+NN/p-NN -> { resolved, decider, subscribers, kernelIsSubscribed }
    // decider is one of: remoteID, 'kernel', 'comms'
    // and maybe resolution:, one of:
    // * {type: 'object', slot}
    // * {type: 'data', data}
    // * {type: 'reject', data}
    nextPromiseIndex: 20,
  };

  return state; // mutable
}

export function dumpState(state) {
  console.log(`Object Table:`);
  for (const id of state.objectTable.keys()) {
    console.log(`${id} : owner=${state.objectTable.get(id)}`);
  }
  console.log();

  console.log(`Promise Table:`);
  for (const id of state.promiseTable.keys()) {
    const p = state.promiseTable.get(id);
    const subscribers = Array.from(p.subscribers);
    if (p.kernelIsSubscribed) {
      subscribers.push('kernel');
    }
    const subs = subscribers.join(',');
    console.log(
      `${id} : owner=${p.owner}, resolved=${p.resolved}, decider=${p.decider}, sub=${subs}`,
    );
  }
  console.log();

  for (const remoteID of state.remotes.keys()) {
    const r = state.remotes.get(remoteID);
    console.log(`${remoteID} '${r.name}':`);
    for (const inbound of r.fromRemote.keys()) {
      const id = r.fromRemote.get(inbound);
      const outbound = r.toRemote.get(id);
      console.log(` ${inbound} -> ${id} -> ${outbound}`);
    }
  }
}

export function buildStateTools(state) {

  function trackUnresolvedPromise(vpid) {
    assert(!state.promiseTable.has(vpid), `${vpid} already present`);
    state.promiseTable.set(vpid, {
      resolved: false,
      decider: COMMS,
      subscribers: [],
      kernelIsSubscribed: false,
    });
  }

  function allocateUnresolvedPromise() {
    const index = state.nextPromiseIndex;
    state.nextPromiseIndex += 1;
    const pid = makeVatSlot('promise', true, index);
    trackUnresolvedPromise(pid);
    return pid;
  }

  function insistDeciderIsRemote(vpid, remoteID) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    const { decider } = p;
    assert.equal(decider, remoteID,
                 `${vpid} is decided by ${decider}, not ${remoteID}`);
  }

  function insistDeciderIsComms(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    const { decider } = p;
    assert.equal(decider, COMMS,
                 `${decider} is the decider for ${vpid}, not me`);
  }

  function insistDeciderIsKernel(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    const { decider } = p;
    assert.equal(decider, KERNEL,
                 `${decider} is the decider for ${vpid}, not kernel`);
  }

  // Decision authority always transfers through the comms vat, so the only
  // legal transitions are remote <-> comms <-> kernel.

  function changeDeciderToRemote(vpid, newDecider) {
    insistRemoteID(newDecider);
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert.equal(p.decider, COMMS);
    p.decider = newDecider;
  }

  function changeDeciderFromRemoteToComms(vpid, oldDecider) {
    insistRemoteID(oldDecider);
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(p, `unknown ${vpid}`);
    assert.equal(p.decider, oldDecider);
    p.decider = COMMS;
  }

  function changeDeciderToKernel(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(p, `unknown ${vpid}`);
    assert.equal(p.decider, COMMS);
    p.decider = KERNEL;
  }

  function changeDeciderFromKernelToComms(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(p, `unknown ${vpid}`);
    assert.equal(p.decider, KERNEL);
    p.decider = COMMS;
  }


  function getPromiseSubscribers(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(p, `unknown ${vpid}`);
    const { subscribers, kernelIsSubscribed } = p;
    return { subscribers, kernelIsSubscribed };
  }

  function subscribeRemoteToPromise(vpid, subscriber) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved, `${vpid} already resolved`);
    p.subscribers.push(subscriber);
  }

  function unsubscribeRemoteFromPromise(vpid, subscriber) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved, `${vpid} already resolved`);
    p.subscribers = p.subscribers.filter(s => s !== subscriber);
  }

  function subscribeKernelToPromise(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved, `${vpid} already resolved`);
    p.kernelIsSubscribed = true;
  }

  function unsubscribeKernelFromPromise(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved, `${vpid} already resolved`);
    p.kernelIsSubscribed = false;
  }

  function insistPromiseIsUnresolved(vpid) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved, `${vpid} was already resolved`);
  }

  function markPromiseAsResolved(vpid, resolution) {
    const p = state.promiseTable.get(vpid);
    assert(p, `unknown ${vpid}`);
    assert(!p.resolved);
    if (resolution.type === 'object') {
      assert(resolution.slot, `resolution(object) requires .slot`);
    } else if (resolution.type === 'data') {
      insistCapData(resolution.data);
    } else if (resolution.type === 'reject') {
      insistCapData(resolution.data);
    } else {
      throw new Error(`unknown resolution type ${resolution.type}`);
    }
    p.resolved = true;
    p.resolution = resolution;
    p.decider = undefined;
    p.subscribers = undefined;
    p.kernelIsSubscribed = undefined;
  }

  return harden({
    trackUnresolvedPromise,
    allocateUnresolvedPromise,

    insistDeciderIsRemote,
    insistDeciderIsComms,
    insistDeciderIsKernel,

    changeDeciderToRemote,
    changeDeciderFromRemoteToComms,
    changeDeciderToKernel,
    changeDeciderFromKernelToComms,

    getPromiseSubscribers,
    subscribeRemoteToPromise,
    unsubscribeRemoteFromPromise,
    subscribeKernelToPromise,
    unsubscribeKernelFromPromise,

    insistPromiseIsUnresolved,
    markPromiseAsResolved,
  });
}
