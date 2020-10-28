/* eslint no-bitwise: [ "off" ], no-self-compare: [ "off" ] */
// @ts-check

import { assert, details as d, quote as q } from '@agoric/assert';

/**
 * @param {string} string  A string of hexadecimal digits with an even length,
 * aligned to bytes.
 * @param {string} [name]  An optional name for the string, for error messages.
 * @return {Uint8Array}  Decoded bytes.
 */
export function decodeHex(string, name = '<unknown>') {
  assert.string(
    string,
    d`Cannot decode hexadecimal from non-string, got ${q(string)}, for ${q(
      name,
    )}`,
  );
  assert(
    (string.length & 1) === 0,
    d`Cannot decode hexadecimal string with a partial byte, expected even length, got ${q(
      string.length,
    )} for ${q(name)}`,
  );
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const j = i * 2;
    const pair = string.slice(j, j + 2);
    const byte = parseInt(pair, 16);
    assert(
      byte === byte,
      d`Cannot decode hexadecimal string with invalid byte ${q(
        pair,
      )} at index ${q(i)} of ${q(name)}`,
    );
    bytes[i] = byte;
  }
  return bytes;
}
