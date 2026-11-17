// Child process that dies between writing the temp file and renaming it, the way a crash or power loss would.
import { create, openVault } from '../../src/core/vault.ts'

const dataKey = openVault(process.env.TEST_PASSWORD ?? '')
await create(dataKey, { name: 'never-written', value: 'lost' }, { beforeRename: () => process.exit(9) })
