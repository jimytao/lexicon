import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/**
 * content script 的独立构建。
 *
 * 为什么不能塞进 vite.config.extension.ts：content script 必须是**单个 IIFE 文件**，
 * 不能用 ESM 与 code-splitting（浏览器不会把 content script 当模块加载，
 * 也没有办法解析它的 import）。而 Rollup 一次构建只能产出一种 format，
 * 所以只能分两次。
 *
 * `npm run build:ext` 会依次跑：主构建（ESM，清空 dist-ext）→ 本构建（IIFE，追加）。
 */
export default defineConfig({
  // 词库在 public/ 里，绝不能被拷进扩展包
  publicDir: false,

  build: {
    outDir: 'dist-ext',
    // 关键：主构建已经清过一次，这里再清就会把它的产物删掉
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/extension/content.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        // IIFE 不允许代码分割；content.ts 本身无外部依赖，这里只是显式声明意图
        inlineDynamicImports: true,
      },
    },
  },
})
