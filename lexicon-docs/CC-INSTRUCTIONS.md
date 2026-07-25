# CC-INSTRUCTIONS — 给 Claude Code 的具体执行指令

> 这份文件是专门给 Claude Code（终端 AI 编程助手）读的。
> 人类开发者：Julian（中文母语，英语学习者，有 React/Vite/Roo Code 经验）。
> 请在开始任何任务前先读完 README.md 和对应的文档文件。

---

## 项目初始化任务

请按以下顺序执行，每步完成后告知结果：

### Step 1：创建项目

```bash
npm create vite@latest lexicon -- --template react-ts
cd lexicon
```

### Step 2：安装依赖

```bash
npm install zustand sql.js
npm install -D tailwindcss @tailwindcss/vite
npm install -D @types/sql.js
```

### Step 3：配置 Vite

按照 `01-architecture.md` 中的 `vite.config.ts` 内容修改配置文件。
**注意**：sql.js 需要 WASM 文件，将 `node_modules/sql.js/dist/sql-wasm.wasm` 复制到 `public/sql-wasm/`：

```bash
mkdir -p public/sql-wasm
cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm/
```

### Step 4：配置 Tailwind

```bash
npx tailwindcss init
```

在 `tailwind.config.ts` 添加自定义颜色 token（见 `02-ui-design.md`）。

### Step 5：创建目录结构

```bash
mkdir -p src/{components/{SearchBar,SuggestList,ResultView/{InstantSection,AiSection},Settings},services,stores,hooks,types}
mkdir -p scripts
```

### Step 6：创建类型文件

按照 `01-architecture.md` 中的类型定义，创建 `src/types/index.ts`。

### Step 7：创建 Store 文件

按照 `05-components.md`，依次创建：
- `src/stores/searchStore.ts`
- `src/stores/resultStore.ts`
- `src/stores/settingsStore.ts`

### Step 8：创建服务层

- `src/services/db.ts`（接口定义）
- `src/services/db.web.ts`（sql.js 实现）
- `src/services/ai.ts`（AI 调用，**完整 system prompt 见 04-ai-schema.md**）

### Step 9：创建 Hook

- `src/hooks/useSearch.ts`
- `src/hooks/useAiLookup.ts`

### Step 10：创建组件

按照组件树（`05-components.md`），从叶子节点到根节点：

1. `WordHeader`
2. `MeaningList`
3. `ExampleList`
4. `SemanticScene`
5. `EtymologyCard`
6. `SynonymList`
7. `AiStatusBar`（含 SkeletonBlock）
8. `InstantSection`（组合 MeaningList + ExampleList）
9. `AiSection`（组合上述 AI 组件）
10. `ResultView`（组合 WordHeader + InstantSection + AiSection）
11. `SuggestList`
12. `ModeToggle`
13. `SearchBar`（组合 input + ModeToggle）
14. `SettingsDrawer`
15. `App`（顶层）

### Step 11：测试

```bash
npm run dev
```

预期：搜索框可以输入，mode 可以切换，Settings 抽屉可以打开。
（词库尚未导入，lookup 会返回 null，是正常的）

---

## 词库导入任务（Step 12，独立执行）

在用户提供 MDX 文件路径后执行：

```bash
npm install -D tsx better-sqlite3 @types/better-sqlite3
# MDX 解析：
npm install -D mdict-analysis
# 或用 python readmdict 生成 TSV 后再导入
```

创建 `scripts/mdx-to-sqlite.ts`，逻辑：
1. 解析 MDX → 提取 word + HTML content
2. cheerio 解析 HTML → 提取释义、例句、音标、词性
3. 写入 `public/lexicon.db`
4. 构建 suggest 表

运行：
```bash
npx tsx scripts/mdx-to-sqlite.ts --input ./oald9.mdx --output ./public/lexicon.db
```

---

## 编码规范（请严格遵守）

- **TypeScript**：所有文件 strict 模式，不用 `any`（除非与第三方库交互必须）
- **组件**：函数式组件 + hooks，不用 class component
- **样式**：只用 Tailwind utility class，不写 CSS 文件，不用 inline style（除非动态值）
- **命名**：
  - 组件文件：`PascalCase.tsx`
  - hook 文件：`useCamelCase.ts`
  - store 文件：`camelCaseStore.ts`
  - service 文件：`camelCase.ts`
- **导入顺序**：React → 第三方库 → 内部 types → 内部 services/stores/hooks → 内部组件
- **注释**：只在"为什么这么做"的地方注释，不注释显而易见的逻辑

## 常见问题预判

**Q：sql.js WASM 加载报 CORS 错误？**
检查 vite.config.ts 是否有 COOP/COEP 头，以及 `locateFile` 路径是否正确。

**Q：Tailwind 样式不生效？**
确认 `tailwind.config.ts` 的 `content` 包含 `./src/**/*.{ts,tsx}`。

**Q：AI 调用返回 JSON 解析失败？**
在 `ai.ts` 的 catch 里 `console.error(raw)` 查看原始返回，检查 system prompt 是否完整传入。

**Q：suggest 查询返回空数组？**
词库未加载，需要先执行 Step 12（词库导入）。开发期间可以用硬编码的 mock 数据测试 UI。

## Mock 数据（开发期间使用）

在词库未导入前，在 `src/services/db.ts` 中临时返回 mock 数据：

```ts
// 临时 mock，Step 12 完成后删除
export const db: DBService = {
  async suggest(prefix) {

    const words = ['satisfaction', 'satisfy', 'satisfactory', 'satisfying', 'satiate']
    return words
      .filter(w => w.startsWith(prefix.toLowerCase()))
      .map(w => ({ word: w, zhBrief: '示例释义' }))
  },
  async lookup(word) {
    if (word !== 'satisfaction') return null
    return {
      word: 'satisfaction',
      phonetic: '/ˌsæt.ɪsˈfæk.ʃən/',
      pos: 'noun',
      meanings: [
        { zh: '（期望达成后的）满足感', en: 'The feeling of pleasure when sth you wanted to happen does happen.' },
        { zh: '（需求或要求被回应后的）满意', en: 'The act of fulfilling a need, desire, or demand.' },
      ],
      examples: [
        { en: 'She looked at the finished painting with deep satisfaction.', zh: '她带着深深的满足感望着完成的画。' },
      ],
    }
  },
  async addHistory() {},
  async getHistory() { return [] },
}
```

## Agent Memory Update (Phase 5)

Please note that we have introduced the Memory / Cognitive diagnostic system. When requested to work on profile tracking, review `08-ai-learning-system-and-profile.md` for architecture details.

## UI/UX Design System Enforcement
Before modifying or creating ANY UI components, you MUST read `lexicon-docs/09-ui-ux-design-system.md` and strictly adhere to its rules (especially regarding Box-in-Box antipatterns and padding alignment). This ensures the app maintains an industrial, highly structured visual harmony.
