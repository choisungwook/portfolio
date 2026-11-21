import { existsSync } from 'node:fs'
import { z } from 'zod'
import {
  csvRead, csvWrite, officePath, pptxCreate, pptxDuplicateSlide, pptxRead, pptxReplaceText, sharedRelativeOrAbsolute,
  xlsxRead, xlsxSetCells, xlsxWrite,
} from '../office/files.ts'
import { sharedDir } from './shared.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

// CSV, Excel and PowerPoint for bots (src/office/files.ts). The path rule is the same for all of them: when the user
// named a file, pass its absolute path and keep working on that file; otherwise use a relative path, which is a file in
// the shared folder (a new one when it does not exist).
const PATH_HELP = 'path: the absolute path of the file the user gave you, or a relative path for a file in the shared folder (created if missing).'
const cell = z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()])

export function officeTools(scope: ScopedTools): TeamTool[] {
  const { config, wrote } = scope
  const shared = () => sharedDir(config)
  const run = async <T extends Record<string, unknown>>(work: () => Promise<T> | T): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error))
    }
  }
  const path = (args: Record<string, unknown>, ext: string) => officePath(shared(), String(args.path), ext)
  const shown = (full: string) => sharedRelativeOrAbsolute(shared(), full)
  const changed = <T extends Record<string, unknown>>(full: string, out: T) => {
    wrote()
    return { ...out, path: shown(full) }
  }
  return [
    {
      name: 'csv_read',
      description: `Read rows of a CSV file. ${PATH_HELP} offset and limit (default 0 and 200, at most 1000) page through a long file; total is the row count.`,
      input: { path: z.string().min(1).max(1000), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(1000).optional() },
      readOnly: true,
      handler: (args) => run(() => csvRead(path(args, '.csv'), Number(args.offset ?? 0), Number(args.limit ?? 200))),
    },
    {
      name: 'csv_write',
      description: `Write rows to a CSV file: mode replace writes the whole file, append adds rows at its end. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), rows: z.array(z.array(z.string().max(10_000))).max(20_000), mode: z.enum(['replace', 'append']) },
      readOnly: false,
      handler: (args) => run(() => { const full = path(args, '.csv'); return changed(full, csvWrite(full, args.rows as string[][], args.mode === 'append')) }),
    },
    {
      name: 'xlsx_read',
      description: `Read an Excel workbook: its sheet names and the rows of one sheet (the first unless sheet is given), at most limit rows (default 200). Formulas show their last computed value. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), sheet: z.string().max(100).optional(), limit: z.number().int().min(1).max(2000).optional() },
      readOnly: true,
      handler: (args) => run(() => xlsxRead(path(args, '.xlsx'), args.sheet as string | undefined, Number(args.limit ?? 200))),
    },
    {
      name: 'xlsx_write',
      description: `Create an Excel workbook from sheets of rows, replacing the file if it exists. To change some cells of an existing workbook and keep its formatting, use xlsx_set_cells instead. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), sheets: z.array(z.object({ name: z.string().min(1).max(31), rows: z.array(z.array(cell)).max(20_000) })).min(1).max(50) },
      readOnly: false,
      handler: (args) => run(async () => { const full = path(args, '.xlsx'); return changed(full, await xlsxWrite(full, args.sheets as { name: string; rows: (string | number | boolean | null)[][] }[])) }),
    },
    {
      name: 'xlsx_set_cells',
      description: `Set cells of one sheet (A1 references), keeping the rest of the workbook and its formatting. A cell takes value, or formula such as "SUM(B2:B9)". The sheet and the file are created if missing. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), sheet: z.string().min(1).max(31), cells: z.array(z.object({ ref: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/), value: cell.optional(), formula: z.string().max(2000).optional() })).min(1).max(5000) },
      readOnly: false,
      handler: (args) => run(async () => { const full = path(args, '.xlsx'); return changed(full, await xlsxSetCells(full, String(args.sheet), args.cells as { ref: string; value?: string | number | boolean | null; formula?: string }[])) }),
    },
    {
      name: 'pptx_read',
      description: `Read a PowerPoint deck: each slide's text, paragraph by paragraph, in the order the deck shows them. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000) },
      readOnly: true,
      handler: (args) => run(() => pptxRead(path(args, '.pptx'))),
    },
    {
      name: 'pptx_replace_text',
      description: `Replace text on one slide (1-based) of an existing deck, keeping its design. find must sit in one text run: use a paragraph as pptx_read shows it, or part of one. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), slide: z.number().int().min(1), find: z.string().min(1).max(2000), replace: z.string().max(5000) },
      readOnly: false,
      handler: (args) => run(async () => { const full = path(args, '.pptx'); return changed(full, await pptxReplaceText(full, Number(args.slide), String(args.find), String(args.replace))) }),
    },
    {
      name: 'pptx_add_slide',
      description: `Add a slide to an existing deck by copying one of its slides (layout, design, pictures) to the end; then change the copy's text with pptx_replace_text. ${PATH_HELP}`,
      input: { path: z.string().min(1).max(1000), copy_of: z.number().int().min(1) },
      readOnly: false,
      handler: (args) => run(async () => { const full = path(args, '.pptx'); return changed(full, await pptxDuplicateSlide(full, Number(args.copy_of))) }),
    },
    {
      name: 'pptx_create',
      description: `Create a new deck: one slide per item with a title, bullets and speaker notes. Refuses an existing file unless overwrite is true; to keep working on a deck the user gave you, use pptx_read, pptx_replace_text and pptx_add_slide. ${PATH_HELP}`,
      input: {
        path: z.string().min(1).max(1000), title: z.string().max(200).optional(), overwrite: z.boolean().optional(),
        slides: z.array(z.object({ title: z.string().max(300), bullets: z.array(z.string().max(1000)).max(20).optional(), notes: z.string().max(5000).optional() })).min(1).max(200),
      },
      readOnly: false,
      handler: (args) => run(async () => {
        const full = path(args, '.pptx')
        if (existsSync(full) && args.overwrite !== true) throw new Error(`${shown(full)} exists; pass overwrite true or edit it with pptx_replace_text and pptx_add_slide`)
        return changed(full, await pptxCreate(full, args.title as string | undefined, args.slides as { title: string; bullets?: string[]; notes?: string }[]))
      }),
    },
  ]
}
