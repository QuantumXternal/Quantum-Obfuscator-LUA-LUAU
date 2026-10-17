import { deflateRawSync, inflateRawSync } from "zlib";

export function base85Encode(data: Uint8Array): string {
  let padded = data;
  if (data.length % 4 !== 0) {
    const padLen = 4 - (data.length % 4);
    padded = new Uint8Array(data.length + padLen);
    padded.set(data);
  }

  let result = "";
  for (let i = 0; i < padded.length; i += 4) {
    const val =
      (padded[i] << 24) |
      (padded[i + 1] << 16) |
      (padded[i + 2] << 8) |
      padded[i + 3];

    const uval = val >>> 0;

    if (uval === 0) {
      result += "z";
      continue;
    }

    let v = uval;
    const c = new Array(5);
    for (let j = 4; j >= 0; j--) {
      c[j] = String.fromCharCode(33 + (v % 85));
      v = Math.floor(v / 85);
    }
    result += c.join("");
  }

  return result;
}

export function base85Decode(str: string): Uint8Array {
  const result: number[] = [];
  let i = 0;
  str = str.replace(/z/g, "!!!!!");
  while (i < str.length) {
    if (i + 5 <= str.length) {
      let val = 0;
      for (let j = 0; j < 5; j++) {
        val = val * 85 + (str.charCodeAt(i + j) - 33);
      }
      result.push((val >>> 24) & 0xFF);
      result.push((val >>> 16) & 0xFF);
      result.push((val >>> 8) & 0xFF);
      result.push(val & 0xFF);
      i += 5;
    } else {
      const remaining = str.length - i;
      let val = 0;
      for (let j = 0; j < remaining; j++) {
        val = val * 85 + (str.charCodeAt(i + j) - 33);
      }
      for (let j = remaining; j < 5; j++) {
        val = val * 85 + 84;
      }
      for (let j = 0; j < remaining - 1; j++) {
        result.push((val >>> (24 - j * 8)) & 0xFF);
      }
      i += remaining;
    }
  }
  return new Uint8Array(result);
}

function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  const MOD = 65521;
  let idx = 0;
  while (idx < data.length) {
    const end = Math.min(idx + 5552, data.length);
    for (; idx < end; idx++) {
      a += data[idx];
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return b * 65536 + a;
}

function generateSBox(rng: () => number): number[] {
  const sbox = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sbox[i], sbox[j]] = [sbox[j], sbox[i]];
  }
  return sbox;
}

function invertSBox(sbox: number[]): number[] {
  const inv = new Array(256);
  for (let i = 0; i < 256; i++) {
    inv[sbox[i]] = i;
  }
  return inv;
}

export interface ClydeBlob {
  blob: string;
  xorKey: number[];
  invSbox: number[];
  checksum: number;
  origLen: number;
  /** Phase 2.1: 4 Feistel round keys (XOR -> Feistel -> CBC). */
  feistelKeys: number[];
}

export function encryptAndEncode(input: string, rng: () => number): ClydeBlob {
  const encoder = new TextEncoder();
  const raw = encoder.encode(input);
  const origLen = raw.length;

  const checksum = adler32(raw);

  const sbox = generateSBox(rng);
  const invSbox = invertSBox(sbox);

  const keyLen = 20 + Math.floor(rng() * 13);
  const xorKey: number[] = [];
  for (let i = 0; i < keyLen; i++) {
    xorKey.push(Math.floor(rng() * 256));
  }

  // Phase 2.1: 4 Feistel round keys (XOR -> Feistel -> CBC).
  const feistelKeys: number[] = [];
  for (let i = 0; i < 4; i++) feistelKeys.push(Math.floor(rng() * 256));

  const substituted = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    substituted[i] = sbox[raw[i]];
  }

  // Feistel network (4 rounds) on byte-pairs: forward for encryption.
  const feistelOut = new Uint8Array(substituted.length);
  for (let i = 0; i < substituted.length; i++) {
    if (i + 1 < substituted.length) {
      let L = substituted[i];
      let R = substituted[i + 1];
      for (let r = 0; r < 4; r++) {
        const newL = R;
        const newR = L ^ (((R + feistelKeys[r]) & 0xFF));
        L = newL; R = newR;
      }
      feistelOut[i] = L;
      feistelOut[i + 1] = R;
      i++; // skip paired byte
    } else {
      feistelOut[i] = substituted[i];
    }
  }

  const encrypted = new Uint8Array(feistelOut.length);
  encrypted[0] = feistelOut[0] ^ xorKey[0];
  for (let i = 1; i < feistelOut.length; i++) {
    encrypted[i] = feistelOut[i] ^ xorKey[i % keyLen] ^ encrypted[i - 1];
  }

  const blob = base85Encode(encrypted);

  return { blob, xorKey, invSbox, checksum, origLen, feistelKeys };
}

export function compressToBase85(input: string): string {
  const encoder = new TextEncoder();
  return base85Encode(encoder.encode(input));
}

export function compressBytesToBase85(input: Uint8Array): string {
  return base85Encode(input);
}

export function compress(input: Uint8Array): Uint8Array {
  return deflateRawSync(input, { level: 9 });
}

export function decompress(input: Uint8Array): Uint8Array {
  return inflateRawSync(input);
}
