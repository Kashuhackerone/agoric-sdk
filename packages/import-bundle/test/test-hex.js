import '@agoric/install-ses';
import test from 'ava';

import { decodeHex } from '../src/hex.js';

const happyCases = [
  { input: '', output: [] },
  { input: '00', output: [0] },
  { input: 'FF', output: [255] },
  {
    input: '00112233445566778899AABBCCDDEEFF',
    output: [
      0,
      17,
      34,
      51,
      68,
      85,
      102,
      119,
      136,
      153,
      170,
      187,
      204,
      221,
      238,
      255,
    ],
  },
];

const sadCases = [
  {
    input: 1,
    message: 'Cannot decode hexadecimal from non-string, got 1 ("<unknown>")',
  },
  {
    input: '1',
    message:
      'Cannot decode hexadecimal string with a partial byte, expected even length, got 1 ("<unknown>")',
  },
  {
    input: 'xx',
    message:
      'Cannot decode hexadecimal string with invalid byte "xx" at index 0 of "<unknown>"',
  },
  {
    input: '0000000x',
    name: 'file.hex',
    message:
      'Cannot decode hexadecimal string with invalid byte "0x" at index 3 of "file.hex"',
  },
];

for (const c of happyCases) {
  test(`decode hex ${c.input}`, t => {
    const output = decodeHex(c.input);
    t.deepEqual([...output], c.output);
  });
}

for (const c of sadCases) {
  test(`decode hex ${JSON.stringify(c.input)}`, t => {
    t.throws(() => decodeHex(c.input, c.name), { message: c.message });
  });
}
