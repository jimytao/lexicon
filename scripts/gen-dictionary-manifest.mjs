/**
 * 生成扩展用的词库清单 manifest.json
 * 用法：node scripts/gen-dictionary-manifest.mjs [tag]
 *
 * 输入：public/assets/databases/*.db
 * 输出：dist-dictionaries/manifest.json（连同要上传的 .db 一起挂到 GitHub Release）
 *
 * 为什么要脚本化：SHA-256 手抄错一位，用户端就会「下载完却校验失败」，
 * 且错误信息指向文件损坏、极难排查。哈希必须由机器算。
 *
 * 上传流程见 lexicon-docs/10-browser-extension.md §3。
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 清单里 enen 可缺失 —— 扩展会降级到双语库（见 db.extension.ts）。 */
const DICTS = [
  { id: 'enzh', file: 'lexicon.db', version: 'oald9-1' },
  { id: 'enen', file: 'lexicon_en.db', version: 'oald10-1' },
]

// 资产所在的 Release tag。清单本身固定挂在 `dictionaries` tag 上
//（db.extension.ts 里硬编码那个 URL），但资产可以放在任意 tag。
const tag = process.argv[2] ?? 'dictionaries'
const base = `https://github.com/jimytao/lexicon/releases/download/${tag}`

const manifest = {}
for (const { id, file, version } of DICTS) {
  const path = resolve(ROOT, 'public/assets/databases', file)
  let bytes
  try {
    bytes = readFileSync(path)
  } catch {
    console.warn(`跳过 ${file}（不存在于 ${path}）`)
    continue
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  manifest[id] = {
    version,
    url: `${base}/${file}`,
    sha256,
    bytes: statSync(path).size,
  }
  console.log(`${file}  ${(bytes.length / 1048576).toFixed(1)}MB  ${sha256.slice(0, 16)}…`)
}

if (!manifest.enzh) {
  console.error('错误：enzh（lexicon.db）是必需的，清单未生成')
  process.exit(1)
}

const outDir = resolve(ROOT, 'dist-dictionaries')
mkdirSync(outDir, { recursive: true })
const outFile = resolve(outDir, 'manifest.json')
writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n')

console.log(`\n已写出 ${outFile}`)
console.log(`\n下一步：把以下文件挂到 GitHub Release tag「dictionaries」`)
console.log(`  - dist-dictionaries/manifest.json`)
for (const { file } of DICTS) console.log(`  - public/assets/databases/${file}`)
