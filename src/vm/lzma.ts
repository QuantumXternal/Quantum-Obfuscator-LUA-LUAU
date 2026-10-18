import { deflateRawSync, inflateRawSync } from "zlib";

export function base85Encode(data: Uint8Array): string {
  let padded = data;
  if (data.length % 4 !== 0) {
    const padLen = 4 - (data.length % 4);
    padded = new Uint8Array(data.length + padLen);
    padded.set(data);
  }

  // Chunked accumulation, byte-identical to the previous `result +=` builder
  // (group digits are still computed least-significant-first into c[4..0]
  // and emitted in c[0..4] order), with bounded intermediate strings.
  const parts: string[] = [];
  let chunk = "";

  for (let i = 0; i < padded.length; i += 4) {
    const val =
      (padded[i] << 24) |
      (padded[i + 1] << 16) |
      (padded[i + 2] << 8) |
      padded[i + 3];

    const uval = val >>> 0;

    if (uval === 0) {
      chunk += "z";
      if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
      continue;
    }

    let v = uval;
    const c4 = 33 + (v % 85); v = Math.floor(v / 85);
    const c3 = 33 + (v % 85); v = Math.floor(v / 85);
    const c2 = 33 + (v % 85); v = Math.floor(v / 85);
    const c1 = 33 + (v % 85); v = Math.floor(v / 85);
    const c0 = 33 + (v % 85);
    chunk += String.fromCharCode(c0, c1, c2, c3, c4);
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
  }

  if (chunk.length > 0) parts.push(chunk);
  return parts.join("");
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

/**
 * Raw LZ4 block compression (no frame header). Greedy match finder with a
 * 2^16-entry 4-byte hash table and interior-position refreshes on matches.
 * Output is consumed by the pure-Luau `unlz4` decoder emitted in the
 * bootstrap template (same token layout: token, litLen ext, literals,
 * offset LE16, matchLen ext).
 */
export function lz4Compress(input: Uint8Array): Uint8Array {
  const n = input.length;
  const out: number[] = [];
  const MIN = 4;
  const MAXOFF = 65535;
  const HSIZE = 1 << 16;
  const head = new Int32Array(HSIZE).fill(-1);

  const hashAt = (i: number): number => {
    const v = (input[i] | (input[i + 1] << 8) | (input[i + 2] << 16) | (input[i + 3] << 24)) >>> 0;
    return (Math.imul(v, 2654435761) >>> 16) & (HSIZE - 1);
  };

  let ip = 0;
  let anchor = 0;
  while (ip + MIN <= n) {
    const h = hashAt(ip);
    const cand = head[h];
    head[h] = ip;
    if (
      cand >= 0 && ip - cand <= MAXOFF &&
      input[cand] === input[ip] && input[cand + 1] === input[ip + 1] &&
      input[cand + 2] === input[ip + 2] && input[cand + 3] === input[ip + 3]
    ) {
      let len = MIN;
      while (ip + len < n && input[cand + len] === input[ip + len]) len++;
      const lit = ip - anchor;
      out.push((Math.min(lit, 15) << 4) | Math.min(len - 4, 15));
      if (lit >= 15) {
        let r = lit - 15;
        while (r >= 255) { out.push(255); r -= 255; }
        out.push(r);
      }
      for (let i = anchor; i < ip; i++) out.push(input[i]);
      const off = ip - cand;
      out.push(off & 255, (off >>> 8) & 255);
      if (len - 4 >= 15) {
        let r = len - 4 - 15;
        while (r >= 255) { out.push(255); r -= 255; }
        out.push(r);
      }
      const mStart = ip;
      ip += len;
      for (let j = mStart + 1; j < ip && j + MIN <= n; j += 2) {
        head[hashAt(j)] = j;
      }
      anchor = ip;
      continue;
    }
    ip++;
  }

  const lit = n - anchor;
  out.push(Math.min(lit, 15) << 4);
  if (lit >= 15) {
    let r = lit - 15;
    while (r >= 255) { out.push(255); r -= 255; }
    out.push(r);
  }
  for (let i = anchor; i < n; i++) out.push(input[i]);

  return Uint8Array.from(out);
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
  /** Length of the original (uncompressed) payload in bytes. */
  origLen: number;
  /** Length of the LZ4-compressed payload in bytes (what the blob carries). */
  compLen: number;
  /** Phase 2.1: 4 Feistel round keys (XOR -> Feistel -> CBC). */
  feistelKeys: number[];
}

export function encryptAndEncode(input: string, rng: () => number): ClydeBlob {
  const encoder = new TextEncoder();
  const raw = encoder.encode(input);
  const origLen = raw.length;

  // v3.2: LZ4-compress before encryption; the bootstrap inflates after
  // decrypt and verifies the checksum over the inflated payload.
  const compressed = lz4Compress(raw);
  const compLen = compressed.length;

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

  const substituted = new Uint8Array(compressed.length);
  for (let i = 0; i < compressed.length; i++) {
    substituted[i] = sbox[compressed[i]];
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

  return { blob, xorKey, invSbox, checksum, origLen, compLen, feistelKeys };
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
