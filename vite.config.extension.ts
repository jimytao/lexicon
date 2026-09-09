import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 浏览器扩展（MV3）构建配置。与 vite.config.ts 并存、互不影响。
 * 设计见 lexicon-docs/10-browser-extension.md §7。
 *
 *   npm run build:ext  → dist-ext/
 */

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string
}

/**
 * manifest.json 由构建期生成，**版本号从 package.json 注入** ——
 * 与 workflow.md 的「版本号单一来源」约定一致，避免发版时漏改。
 */
function manifestPlugin(): Plugin {
  return {
    name: 'lexicon-manifest',
    generateBundle() {
      const manifest = {
        manifest_version: 3,
        name: 'Lexicon',
        version: pkg.version,
        description: '面向中文母语者的英语单词学习工具 —— 词源、语义情景、母语者用法。',

        // 点扩展图标即打开侧栏（行为在 background.ts 里用 setPanelBehavior 设定）
        action: { default_title: 'Lexicon' },
        side_panel: { default_path: 'sidepanel.html' },
        background: { service_worker: 'background.js', type: 'module' },

        permissions: ['sidePanel', 'storage', 'contextMenus'],

        // 悬浮查词按钮。注入所有页面是它的固有代价（用户已确认接受）：
        // Chrome 安装时会提示「读取和更改所有网站数据」。
        // 缓解在实现里：选中文字前只挂一个监听、不做任何事；另有全局开关。
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            run_at: 'document_idle',
            // 只在主框架注入：iframe 里选词的价值低，注入成本却翻倍
            all_frames: false,
          },
        ],

        // 快捷键路径最可靠（走 action 点击路径开侧栏），见 pendingQuery.ts 头注释
        commands: {
          'lookup-selection': {
            suggested_key: { default: 'Alt+L' },
            description: 'Look up the selected text in Lexicon',
          },
        },

        // P2：SW 代理需要它才能豁免 CORS。
        //
        // 为什么必须是 <all_urls> 而不能枚举域名：
        //   1. AI 端点由**用户自填**（自建 / 中转），无法预知
        //   2. 图片来自搜索结果的任意图床，同样无法枚举
        // 搜索 API 本身是固定的，单独列出以便上架时说明用途。
        // 注意：declarativeNetRequest 刻意**未**声明 —— 见 MeaningList 里的说明，
        // 全局剥 Referer 会波及用户浏览的每个网站，风险远大于收益。
        host_permissions: [
          'https://api.search.brave.com/*',
          'https://api.tavily.com/*',
          '<all_urls>',
        ],

        // 刻意不声明 cross_origin_embedder_policy：
        // require-corp 会反过来拦掉跨源图片、毁掉 §5 的主要收益。
        // 若 P1 实测 sql.js 报 SharedArrayBuffer 相关错误，再加 credentialless。
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      })

      // publicDir 被关掉了（避免 70MB 词库进包），但 sql.js 的 wasm 必须带上。
      // 路径保持 /sql-wasm/*，这样 db.web.ts 的 locateFile 无需为扩展改动。
      const wasmDir = resolve(__dirname, 'public/sql-wasm')
      for (const file of readdirSync(wasmDir)) {
        this.emitFile({
          type: 'asset',
          fileName: `sql-wasm/${file}`,
          source: readFileSync(resolve(wasmDir, file)),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), manifestPlugin()],

  // 关键：默认的 public/ 里有 70MB 词库，绝不能拷进扩展包。
  // 词库改为首启远程下载至 OPFS（P1，见 §3）。
  // 副作用：public/sql-wasm/ 也不会被拷贝，所以 P0 阶段词库查询还不能工作
  //（P0 验收只要求侧栏渲染空态首页）。P1 需为 sql.js 的 wasm 单独安排产物路径。
  publicDir: false,

  build: {
    outDir: 'dist-ext',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/extension/background.ts'),
      },
      output: {
        // manifest 里的 service_worker 路径必须可预测，所以入口不加 hash
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
