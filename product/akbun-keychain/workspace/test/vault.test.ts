import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, test } from 'node:test'
import { KeychainError, type ErrorCode } from '../src/core/errors.ts'
import {
  changePassword, create, initVault, list, openVault, remove, rename, reveal, update, verify,
} from '../src/core/vault.ts'
import { FIXTURES, PASSWORD, TEST_KDF_N, encodings, useTempHome } from './helpers.ts'

const SECRET = 'ghp_TestSecretValue1234567890abcdef'

let home: string
let dataKey: Buffer

function vaultFile(): string {
  return join(home, 'vault.json')
}

// Loose shape for editing the file by hand the way an attacker would.
interface RawVault {
  kdf: { N: number }
  entries: Record<string, Record<string, unknown>>
}

function readJson(): RawVault {
  return JSON.parse(readFileSync(vaultFile(), 'utf8')) as RawVault
}

function writeJson(data: unknown): void {
  writeFileSync(vaultFile(), `${JSON.stringify(data, null, 2)}\n`)
}

function rejectsWith(code: ErrorCode) {
  return (error: unknown) => error instanceof KeychainError && error.code === code
}

async function fixtureVault(): Promise<void> {
  home = useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  dataKey = openVault(PASSWORD)
  await create(dataKey, { name: 'github/token', value: SECRET, description: 'repo read', tags: ['github'] })
  await create(dataKey, { name: 'aws/key', value: 'aws-secret-value-0001', ai_access: 'reveal' })
}

describe('opening', () => {
  beforeEach(fixtureVault)

  test('[critical] a wrong password fails to open and does not write', () => {
    const before = readFileSync(vaultFile())
    const mtime = statSync(vaultFile()).mtimeMs
    assert.throws(() => openVault('wrong password here'), rejectsWith('BAD_PASSWORD'))
    assert.deepEqual(readFileSync(vaultFile()), before)
    assert.equal(statSync(vaultFile()).mtimeMs, mtime)
  })

  test('[critical] lowering kdf.N below 2^15 in the file is refused', () => {
    const data = readJson()
    data.kdf.N = 2 ** 14
    writeJson(data)
    assert.throws(() => openVault(PASSWORD), rejectsWith('INTEGRITY'))
  })

  test('a password shorter than 12 characters is refused at init', async () => {
    useTempHome()
    await assert.rejects(initVault('short', { kdfN: TEST_KDF_N }), rejectsWith('INVALID'))
  })

  test('a kdf N that the reader would refuse is not written', async () => {
    await assert.rejects(changePassword(PASSWORD, 'another long root password', { kdfN: 2 ** 14 }), rejectsWith('INVALID'))
    useTempHome()
    await assert.rejects(initVault(PASSWORD, { kdfN: 2 ** 14 }), rejectsWith('INVALID'))
    await assert.rejects(initVault(PASSWORD, { kdfN: 3 * 2 ** 15 }), rejectsWith('INVALID'))
  })

  test('init refuses to overwrite an existing vault', async () => {
    await assert.rejects(initVault(PASSWORD, { kdfN: TEST_KDF_N }), rejectsWith('ALREADY_INITIALIZED'))
  })
})

describe('operations', () => {
  beforeEach(fixtureVault)

  test('create, list, reveal, update, rename and remove round-trip', async () => {
    assert.equal(reveal(dataKey, 'github/token'), SECRET)
    assert.deepEqual(list(dataKey).map((entry) => [entry.name, entry.ai_access, entry.intact]), [
      ['aws/key', 'reveal', true],
      ['github/token', 'inject', true],
    ])

    const updated = await update(dataKey, 'github/token', { description: 'changed', tags: ['b', 'a', 'b'] })
    assert.equal(updated.version, 2)
    assert.deepEqual(updated.tags, ['a', 'b'])
    assert.equal(reveal(dataKey, 'github/token'), SECRET)

    await update(dataKey, 'github/token', { value: 'new value\nwith two lines' })
    assert.equal(reveal(dataKey, 'github/token'), 'new value\nwith two lines')

    const renamed = await rename(dataKey, 'github/token', 'github/personal')
    assert.equal(renamed.version, 4)
    assert.equal(reveal(dataKey, 'github/personal'), 'new value\nwith two lines')
    assert.throws(() => reveal(dataKey, 'github/token'), rejectsWith('NOT_FOUND'))

    await remove(dataKey, 'github/personal')
    assert.deepEqual(list(dataKey).map((entry) => entry.name), ['aws/key'])
  })

  test('names that exist on Object.prototype are ordinary keys', async () => {
    assert.throws(() => reveal(dataKey, 'constructor'), rejectsWith('NOT_FOUND'))
    await assert.rejects(remove(dataKey, 'constructor'), rejectsWith('NOT_FOUND'))
    await create(dataKey, { name: 'constructor', value: 'proto-safe' })
    assert.equal(reveal(dataKey, 'constructor'), 'proto-safe')
  })

  test('create on an existing name fails with EXISTS', async () => {
    await assert.rejects(create(dataKey, { name: 'aws/key', value: 'x' }), rejectsWith('EXISTS'))
  })

  test('format rules are enforced without echoing the input', async () => {
    await assert.rejects(create(dataKey, { name: 'Upper/Case', value: 'x' }), rejectsWith('INVALID'))
    await assert.rejects(create(dataKey, { name: 'a', value: 'x', tags: ['Bad Tag'] }), rejectsWith('INVALID'))
    await assert.rejects(create(dataKey, { name: 'a', value: 'x', description: 'd'.repeat(501) }), rejectsWith('INVALID'))
    const big = 'v'.repeat(64 * 1024 + 1)
    await assert.rejects(create(dataKey, { name: 'a', value: big }), (error: unknown) => {
      return error instanceof KeychainError && error.code === 'INVALID' && !error.message.includes('vvvv')
    })
  })

  test('the file is sorted, two-space indented and ends with a newline', () => {
    const text = readFileSync(vaultFile(), 'utf8')
    assert.ok(text.endsWith('}\n'))
    assert.ok(text.includes('\n  "entries": {\n    "aws/key"'))
    assert.ok(text.indexOf('"aws/key"') < text.indexOf('"github/token"'))
  })

  test('[critical] the serialized file contains no plaintext value', async () => {
    await update(dataKey, 'github/token', { description: 'touch' })
    for (const file of ['vault.json', 'vault.json.bak']) {
      const text = readFileSync(join(home, file), 'utf8')
      for (const form of encodings(SECRET)) assert.ok(!text.includes(form), `${file} contains the secret`)
    }
  })

  test('changePassword keeps every entry readable and the old password stops working', async () => {
    const newPassword = 'another long root password'
    await changePassword(PASSWORD, newPassword)
    assert.throws(() => openVault(PASSWORD), rejectsWith('BAD_PASSWORD'))
    const key = openVault(newPassword)
    assert.equal(reveal(key, 'github/token'), SECRET)
    assert.equal(reveal(key, 'aws/key'), 'aws-secret-value-0001')
  })

  test('changePassword with a wrong old password changes nothing', async () => {
    const before = readFileSync(vaultFile())
    await assert.rejects(changePassword('wrong password here', 'another long root password'), rejectsWith('BAD_PASSWORD'))
    assert.deepEqual(readFileSync(vaultFile()), before)
  })

  test('files and the directory are created with modes 0600 and 0700', { skip: process.platform === 'win32' }, async () => {
    // A subdirectory, so the mode under test comes from ensureHome and not from mkdtemp.
    const created = join(useTempHome(), 'nested', 'home')
    process.env.AKBUN_KEYCHAIN_HOME = created
    await initVault(PASSWORD, { kdfN: TEST_KDF_N })
    await create(openVault(PASSWORD), { name: 'k', value: 'v' })
    assert.equal(statSync(created).mode & 0o777, 0o700)
    for (const file of ['vault.json', 'vault.json.bak']) {
      assert.equal(statSync(join(created, file)).mode & 0o777, 0o600, file)
    }
  })
})

describe('tampering', () => {
  beforeEach(fixtureVault)

  for (const field of ['description', 'tags', 'ai_access'] as const) {
    test(`[critical] editing ${field} breaks that entry only`, async () => {
      const data = readJson()
      const entry = data.entries['github/token']
      if (field === 'description') entry.description = 'edited by hand'
      if (field === 'tags') entry.tags = ['github', 'more']
      if (field === 'ai_access') entry.ai_access = 'reveal'
      writeJson(data)

      assert.throws(() => reveal(dataKey, 'github/token'), rejectsWith('INTEGRITY'))
      await assert.rejects(update(dataKey, 'github/token', { description: 'fix' }), rejectsWith('INTEGRITY'))
      assert.equal(reveal(dataKey, 'aws/key'), 'aws-secret-value-0001')
      const intact = Object.fromEntries(list(dataKey).map((item) => [item.name, item.intact]))
      assert.deepEqual(intact, { 'aws/key': true, 'github/token': false })
      assert.deepEqual(verify(dataKey), { mac_ok: true, entries_failed: ['github/token'] })
    })
  }

  async function assertEveryOperationFails(): Promise<void> {
    assert.throws(() => list(dataKey), rejectsWith('INTEGRITY'))
    assert.throws(() => reveal(dataKey, 'aws/key'), rejectsWith('INTEGRITY'))
    await assert.rejects(create(dataKey, { name: 'new', value: 'x' }), rejectsWith('INTEGRITY'))
    await assert.rejects(update(dataKey, 'aws/key', { description: 'x' }), rejectsWith('INTEGRITY'))
    await assert.rejects(remove(dataKey, 'aws/key'), rejectsWith('INTEGRITY'))
    assert.equal(verify(dataKey).mac_ok, false)
  }

  test('[critical] editing an entry version fails the MAC', async () => {
    const data = readJson()
    data.entries['github/token'].version = 7
    writeJson(data)
    await assertEveryOperationFails()
  })

  test('[critical] renaming an entry in the file fails the MAC', async () => {
    const data = readJson()
    data.entries['github/other'] = data.entries['github/token']
    delete data.entries['github/token']
    writeJson(data)
    await assertEveryOperationFails()
  })

  test('[critical] removing an entry from the file fails the MAC', async () => {
    const data = readJson()
    delete data.entries['github/token']
    writeJson(data)
    await assertEveryOperationFails()
  })

  test('[critical] replacing an entry with an older copy of itself fails the MAC', async () => {
    const older = readJson().entries['github/token']
    await update(dataKey, 'github/token', { value: 'rotated value' })
    const data = readJson()
    data.entries['github/token'] = older
    writeJson(data)
    await assertEveryOperationFails()
  })
})

describe('crash safety', () => {
  beforeEach(fixtureVault)

  test('a crash between the temp write and the rename leaves the old file valid', async () => {
    const before = readFileSync(vaultFile())
    const child = spawnSync(process.execPath, [join(FIXTURES, 'crash-before-rename.ts')], {
      env: { ...process.env, TEST_PASSWORD: PASSWORD },
      encoding: 'utf8',
    })
    assert.equal(child.status, 9, child.stderr)
    assert.deepEqual(readFileSync(vaultFile()), before)
    assert.equal(reveal(dataKey, 'github/token'), SECRET)
    // The crashed writer left vault.lock behind with a dead pid; the next writer takes it over.
    await create(dataKey, { name: 'after-crash', value: 'ok' })
    assert.deepEqual(list(dataKey).map((entry) => entry.name), ['after-crash', 'aws/key', 'github/token'])
  })
})
