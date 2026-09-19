import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const outputPath = resolve('lexicon-extension-' + pkg.version + '.zip')
await rm(outputPath, { force: true })

const distPath = resolve('dist-ext')
const psExe = spawnSync('where.exe', ['pwsh.exe']).status === 0 ? 'pwsh.exe' : 'powershell.exe'
const result = process.platform === 'win32'
  ? spawnSync(
      psExe,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Compress-Archive -Path (Join-Path $env:LEXICON_DIST_PATH '*') -DestinationPath $env:LEXICON_OUTPUT_PATH -CompressionLevel Optimal",
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, LEXICON_DIST_PATH: distPath, LEXICON_OUTPUT_PATH: outputPath },
      },
    )
  : spawnSync('zip', ['-q', '-r', outputPath, '.'], {
      cwd: distPath,
      stdio: 'inherit',
    })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('Created ' + outputPath)