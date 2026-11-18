import { crc32, deflateRawSync, inflateRawSync, constants } from 'node:zlib'

// A small ZIP reader and writer on node:zlib, for wiki export and import. Entries are deflated at level 9 (the
// strongest deflate; ZIP readers everywhere understand it) unless deflating makes them larger, then they are stored.
// No ZIP64, no encryption: an archive is limited to 65,535 entries and 4 GB, far beyond a wiki.

export interface ZipEntry {
  name: string
  data: Buffer
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8 = 0x0800

function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function writeZip(entries: ZipEntry[], when = new Date()): Buffer {
  const { time, day } = dosTime(when)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const deflated = deflateRawSync(entry.data, { level: constants.Z_BEST_COMPRESSION, memLevel: 9 })
    const stored = deflated.length >= entry.data.length
    const body = stored ? entry.data : deflated
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8, 6)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8, 8)
    central.writeUInt16LE(stored ? 0 : 8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

export interface ZipLimits {
  maxEntries: number
  maxTotalBytes: number    // uncompressed, guards against a zip bomb
}

// Reads every file entry (directories skipped). Throws on a damaged archive, ZIP64, encryption or a limit.
export function readZip(buf: Buffer, limits: ZipLimits = { maxEntries: 5000, maxTotalBytes: 200 * 1024 * 1024 }): ZipEntry[] {
  let endAt = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i -= 1) {
    if (buf.readUInt32LE(i) === END) {
      endAt = i
      break
    }
  }
  if (endAt < 0) throw new Error('not a zip archive')
  const count = buf.readUInt16LE(endAt + 10)
  if (count > limits.maxEntries) throw new Error(`the archive has more than ${limits.maxEntries} entries`)
  let at = buf.readUInt32LE(endAt + 16)
  const out: ZipEntry[] = []
  let total = 0
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== CENTRAL) throw new Error('damaged zip central directory')
    const flags = buf.readUInt16LE(at + 8)
    const method = buf.readUInt16LE(at + 10)
    const size = buf.readUInt32LE(at + 20)
    const raw = buf.readUInt32LE(at + 24)
    const nameLength = buf.readUInt16LE(at + 28)
    const extra = buf.readUInt16LE(at + 30)
    const comment = buf.readUInt16LE(at + 32)
    const localAt = buf.readUInt32LE(at + 42)
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString(flags & UTF8 ? 'utf8' : 'latin1')
    at += 46 + nameLength + extra + comment
    if (name.endsWith('/')) continue
    if (flags & 1) throw new Error(`${name} is encrypted`)
    if (size === 0xffffffff || raw === 0xffffffff) throw new Error('ZIP64 archives are not supported')
    total += raw
    if (total > limits.maxTotalBytes) throw new Error(`the archive unpacks to more than ${limits.maxTotalBytes} bytes`)
    if (buf.readUInt32LE(localAt) !== LOCAL) throw new Error(`damaged zip entry ${name}`)
    const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28)
    const body = buf.subarray(start, start + size)
    let data: Buffer
    if (method === 0) data = Buffer.from(body)
    else if (method === 8) data = inflateRawSync(body, { maxOutputLength: raw + 1 })
    else throw new Error(`${name} uses compression method ${method}; only stored and deflate are supported`)
    if (data.length !== raw) throw new Error(`${name} did not unpack to its recorded size`)
    out.push({ name, data })
  }
  return out
}
