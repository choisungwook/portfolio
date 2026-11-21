// Hashed term vectors: each token lands in one of DIMS buckets (FNV-1a), weighted by log term frequency and
// L2-normalised, so cosine similarity is a dot product. No model, deterministic, works with any tokenizer.
export const DIMS = 512

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function embed(tokens: string[]): Float32Array {
  const counts = new Map<string, number>()
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  const v = new Float32Array(DIMS)
  for (const [t, n] of counts) {
    const h = fnv1a(t)
    v[h % DIMS] += (h & 0x80000000 ? -1 : 1) * (1 + Math.log(n))
  }
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DIMS; i++) v[i] /= norm
  return v
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength)
export const fromBlob = (b: Uint8Array) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
