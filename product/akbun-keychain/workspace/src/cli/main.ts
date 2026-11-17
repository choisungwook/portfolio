import { VERSION } from '../version.ts'

function main(argv: string[]): number {
  const command = argv[0]
  if (command === 'version' || command === '--version') {
    process.stdout.write(`akbun-keychain ${VERSION}\n`)
    return 0
  }
  process.stderr.write(`USAGE: unknown command ${JSON.stringify(command ?? '')}. Run: akbun-keychain version\n`)
  return 2
}

process.exitCode = main(process.argv.slice(2))
