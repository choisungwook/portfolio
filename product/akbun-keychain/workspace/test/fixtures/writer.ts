// Child process for the concurrency tests: creates <count> entries named <prefix>-<n> in the vault at AKBUN_KEYCHAIN_HOME.
import { create, openVault } from '../../src/core/vault.ts'

const [prefix, count] = process.argv.slice(2)
const dataKey = openVault(process.env.TEST_PASSWORD ?? '')
for (let index = 0; index < Number(count); index++) {
  await create(dataKey, { name: `${prefix}-${index}`, value: `value-${prefix}-${index}` })
}
