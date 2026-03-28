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

const pair2int = (a: number, b: number): bigint =>
  a > b ? (BigInt(a) << 24n) | BigInt(b) : (BigInt(b) << 24n) | BigInt(a);

const int2pair = (n: bigint): [number, number] => [
  Number(n >> 24n),
  Number(n & 16777215n),
];

export {
  encodeLEB128,
  decodeLEB128,
  encodeString,
  decodeString,
  pair2int,
  int2pair,
};
