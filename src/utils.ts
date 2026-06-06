function encodeLEB128(value: number, out: number[]): number {
  for (;;) {
    if (!(value & ~127)) return out.push(value);
    out.push((value & 127) | 128);
    value >>>= 7;
  }
}

function decodeLEB128(read: () => number): number {
  let value = 0;
  let shift = 0;
  let byte;
  for (;;) {
    byte = read();
    value |= (byte & 127) << shift;
    if (!(byte & 128)) return value;
    shift += 7;
  }
}

const encodeString = (str: string, out: number[]): void => {
  const enc = new TextEncoder().encode(str).slice(0, 255);
  out.push(enc.length, ...enc);
};

const decodeString = (read: () => number): string => {
  return new TextDecoder().decode(
    new Uint8Array(Array.from({ length: read() }, read)),
  );
};

const BIT_SHIFT_MULTIPLIER = 0x04000000;
const LOWER_ID_BITMASK = BIT_SHIFT_MULTIPLIER - 1;

const pair2int = (a: number, b: number): number =>
  a > b ? a * BIT_SHIFT_MULTIPLIER + b : b * BIT_SHIFT_MULTIPLIER + a;

const int2pair = (n: number): [number, number] => [
  Math.floor(n / BIT_SHIFT_MULTIPLIER),
  n & LOWER_ID_BITMASK,
];

export {
  encodeLEB128,
  decodeLEB128,
  encodeString,
  decodeString,
  pair2int,
  int2pair,
};
