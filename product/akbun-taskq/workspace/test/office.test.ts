import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  csvRead, csvWrite, formatCsv, officePath, parseCsv, pptxCreate, pptxDuplicateSlide, pptxRead, pptxReplaceText, xlsxRead, xlsxSetCells, xlsxWrite,
} from '../src/office/files.ts'

const scratch = () => mkdtempSync(join(tmpdir(), 'taskq-office-'))

test('a relative path is a file in the shared folder; an absolute one is the user\'s file', () => {
  assert.equal(officePath('/s', 'report.csv', '.csv'), '/s/report.csv')
  assert.equal(officePath('/s', '/Users/me/data.csv', '.csv'), '/Users/me/data.csv')
  assert.throws(() => officePath('/s', '../x.csv', '.csv'), /inside the shared folder/)
  assert.throws(() => officePath('/s', 'x.txt', '.csv'), /end in \.csv/)
})

test('CSV keeps commas, quotes and line breaks inside fields', () => {
  const rows = [['name', 'note'], ['a, b', 'say "hi"'], ['c', 'two\nlines']]
  assert.deepEqual(parseCsv(formatCsv(rows)), rows)
  const dir = scratch()
  try {
    const file = join(dir, 'x.csv')
    csvWrite(file, rows.slice(0, 2), false)
    csvWrite(file, rows.slice(2), true)
    assert.deepEqual(csvRead(file, 1, 10), { rows: rows.slice(1), total: 3 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Excel: write, set a value and a formula, read back', async () => {
  const dir = scratch()
  try {
    const file = join(dir, 'book.xlsx')
    await xlsxWrite(file, [{ name: 'Sales', rows: [['item', 'qty'], ['a', 2], ['b', 3]] }])
    await xlsxSetCells(file, 'Sales', [{ ref: 'B4', formula: 'SUM(B2:B3)' }, { ref: 'A4', value: 'total' }])
    const read = await xlsxRead(file, undefined, 10)
    assert.deepEqual(read.sheets, ['Sales'])
    assert.deepEqual(read.rows[3], { row: 4, cells: ['total', null] }, 'a formula no app has computed yet has no value')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('PowerPoint: create, read, replace text, copy a slide', async () => {
  const dir = scratch()
  try {
    const file = join(dir, 'deck.pptx')
    await pptxCreate(file, 'Plan', [{ title: 'Q1 plan', bullets: ['Ship retry limit', 'Review paging'] }, { title: 'Risks' }])
    assert.deepEqual((await pptxRead(file)).slides.map((s) => s.texts[0]), ['Q1 plan', 'Risks'])
    await pptxReplaceText(file, 1, 'Q1', 'Q2')
    await assert.rejects(pptxReplaceText(file, 1, 'nowhere', 'x'), /not in one text run/)
    assert.deepEqual(await pptxDuplicateSlide(file, 1), { slide: 3 })
    await pptxReplaceText(file, 3, 'Q2 plan', 'Q3 plan')
    const slides = (await pptxRead(file)).slides
    assert.deepEqual(slides.map((s) => s.texts[0]), ['Q2 plan', 'Risks', 'Q3 plan'])
    assert.deepEqual(slides[2].texts.slice(1), ['Ship retry limit', 'Review paging'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
