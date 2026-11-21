import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'

// CSV, Excel and PowerPoint files a bot reads and changes. A path the user gave (absolute) is the file the bot keeps
// working on; a relative path is a file in the shared folder, created when it does not exist yet.

export function officePath(shared: string, path: string, extension: string): string {
  const full = isAbsolute(path) ? path : resolve(shared, path)
  if (!isAbsolute(path) && relative(shared, full).startsWith('..')) throw new Error('a relative path must stay inside the shared folder')
  if (!full.toLowerCase().endsWith(extension)) throw new Error(`the file must end in ${extension}`)
  return full
}

function save(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

// ── CSV (RFC 4180: quotes around fields with a comma, quote or line break; "" inside quotes is a quote) ──

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function formatCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(',')).join('\n') + '\n'
}

export function csvRead(path: string, offset: number, limit: number) {
  const rows = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  return { rows: rows.slice(offset, offset + limit), total: rows.length }
}

export function csvWrite(path: string, rows: string[][], append: boolean) {
  const before = append && existsSync(path) ? parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, '')) : []
  const all = [...before, ...rows]
  save(path, formatCsv(all))
  return { rows: all.length }
}

// ── Excel (exceljs keeps the styles, widths and other sheets of a file it edits) ──

type Cell = string | number | boolean | null

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString()
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue)
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    if ('text' in value) return String(value.text)
    return null
  }
  return value
}

async function workbook(path: string): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook()
  if (existsSync(path)) await book.xlsx.readFile(path)
  return book
}

export async function xlsxRead(path: string, sheet: string | undefined, limit: number) {
  if (!existsSync(path)) throw new Error(`no file at ${path}`)
  const book = await workbook(path)
  const ws = sheet ? book.getWorksheet(sheet) : book.worksheets[0]
  if (!ws) throw new Error(`no sheet named ${sheet}`)
  const rows: { row: number; cells: Cell[] }[] = []
  ws.eachRow({ includeEmpty: false }, (row, number) => {
    if (rows.length >= limit) return
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue)
    rows.push({ row: number, cells: values })
  })
  return { sheets: book.worksheets.map((w) => w.name), sheet: ws.name, rows, total_rows: ws.actualRowCount }
}

export async function xlsxWrite(path: string, sheets: { name: string; rows: Cell[][] }[]) {
  const book = new ExcelJS.Workbook()
  for (const s of sheets) book.addWorksheet(s.name).addRows(s.rows)
  mkdirSync(dirname(path), { recursive: true })
  await book.xlsx.writeFile(path)
  return { sheets: sheets.map((s) => s.name) }
}

export async function xlsxSetCells(path: string, sheet: string, cells: { ref: string; value?: Cell; formula?: string }[]) {
  const book = await workbook(path)
  const ws = book.getWorksheet(sheet) ?? book.addWorksheet(sheet)
  for (const c of cells) ws.getCell(c.ref).value = c.formula ? { formula: c.formula.replace(/^=/, '') } : c.value ?? null
  mkdirSync(dirname(path), { recursive: true })
  await book.xlsx.writeFile(path)
  return { changed: cells.length, sheet: ws.name }
}

// ── PowerPoint: an existing deck is edited inside its own XML, so its design stays; a new deck comes from pptxgenjs ──

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// The slide part names in the order the deck shows them.
async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = await zip.file('ppt/presentation.xml')!.async('string')
  const rels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string')
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]))
  return [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => `ppt/${String(target.get(m[1])).replace(/^\/?ppt\//, '')}`)
}

async function deck(path: string): Promise<JSZip> {
  if (!existsSync(path)) throw new Error(`no file at ${path}`)
  return JSZip.loadAsync(readFileSync(path))
}

export async function pptxRead(path: string) {
  const zip = await deck(path)
  const slides = await Promise.all((await slideOrder(zip)).map(async (part, i) => {
    const xml = await zip.file(part)!.async('string')
    const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => unescapeXml(t[1])).join(''))
    return { slide: i + 1, texts: paragraphs.filter((t) => t.trim() !== '') }
  }))
  return { slides }
}

export async function pptxReplaceText(path: string, slide: number, find: string, replace: string) {
  const zip = await deck(path)
  const part = (await slideOrder(zip))[slide - 1]
  if (!part) throw new Error(`the deck has no slide ${slide}`)
  let count = 0
  const xml = (await zip.file(part)!.async('string')).replace(/<a:t>([^<]*)<\/a:t>/g, (whole, text: string) => {
    const plain = unescapeXml(text)
    if (!plain.includes(find)) return whole
    count += plain.split(find).length - 1
    return `<a:t>${escapeXml(plain.replaceAll(find, replace))}</a:t>`
  })
  if (count === 0) throw new Error(`"${find}" is not in one text run of slide ${slide}; read the slide with pptx_read and match a whole run`)
  zip.file(part, xml)
  save(path, await zip.generateAsync({ type: 'uint8array' }))
  return { replaced: count }
}

// Copies a slide (its layout, design and pictures) to the end of the deck; replace_text then edits the copy.
export async function pptxDuplicateSlide(path: string, slide: number) {
  const zip = await deck(path)
  const order = await slideOrder(zip)
  const part = order[slide - 1]
  if (!part) throw new Error(`the deck has no slide ${slide}`)
  const numbers = Object.keys(zip.files).map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f)?.[1]).filter(Boolean).map(Number)
  const n = Math.max(0, ...numbers) + 1
  const name = `slide${n}.xml`
  zip.file(`ppt/slides/${name}`, await zip.file(part)!.async('string'))
  const relsPath = part.replace('slides/', 'slides/_rels/') + '.rels'
  const rels = zip.file(relsPath)
  // A copied slide must not claim the original's speaker notes.
  if (rels) zip.file(`ppt/slides/_rels/${name}.rels`, (await rels.async('string')).replace(/<Relationship\b[^>]*notesSlide[^>]*\/>/g, ''))
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', types.replace('</Types>', `<Override PartName="/ppt/slides/${name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`))
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string')
  const rid = `rIdTaskq${n}`
  zip.file('ppt/_rels/presentation.xml.rels', presRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${name}"/></Relationships>`))
  const pres = await zip.file('ppt/presentation.xml')!.async('string')
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]))
  zip.file('ppt/presentation.xml', pres.replace('</p:sldIdLst>', `<p:sldId id="${Math.max(255, ...ids) + 1}" r:id="${rid}"/></p:sldIdLst>`))
  save(path, await zip.generateAsync({ type: 'uint8array' }))
  return { slide: order.length + 1 }
}

export async function pptxCreate(path: string, title: string | undefined, slides: { title: string; bullets?: string[]; notes?: string }[]) {
  // pptxgenjs is CommonJS: at run time the default import is the class, while its types describe the module.
  const pptx = new (PptxGenJS as unknown as typeof PptxGenJS.default)()
  pptx.layout = 'LAYOUT_WIDE'
  if (title) pptx.title = title
  for (const s of slides) {
    const slide = pptx.addSlide()
    slide.addText(s.title, { x: 0.6, y: 0.4, w: 12.1, h: 1, fontSize: 32, bold: true })
    if (s.bullets?.length) slide.addText(s.bullets.map((text) => ({ text, options: { bullet: true } })), { x: 0.8, y: 1.6, w: 11.7, h: 5.2, fontSize: 20, valign: 'top' })
    if (s.notes) slide.addNotes(s.notes)
  }
  const data = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
  save(path, data)
  return { slides: slides.length }
}

export const sharedRelativeOrAbsolute = (shared: string, path: string) => (path.startsWith(shared) ? relative(shared, path) : path)
