import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const outputPath = resolve('lexicon-extension-' + pkg.version + '.zip')
await rm(outputPath, { force: true })

const result = spawnSync('tar', ['-a', '-c', '-f', outputPath, '-C', resolve('dist-ext'), '.'], {
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('Created ' + outputPath)