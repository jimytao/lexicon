#!/bin/bash
# lexicon-docs/scripts/check-doc-sync.sh
#
# Claude Code Stop Hook — 文档同步自动化
# 每次 Claude 完成一轮响应后自动运行。
# 检测是否有文件变动但遗漏了文档更新，输出指令让 Claude 自动补做。
#
# 检测范围：所有开发相关文件（src/、scripts/、配置文件等）
# 排除范围：文档文件本身（lexicon-docs/、CLAUDE.md）和 .claude/
#
# 输出说明：
#   stdout → 作为新的用户消息送回 Claude（Claude 会自动执行文档更新）
#   无遗漏时不输出（静默通过，不触发新一轮对话）

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

# ── 获取所有变动文件 ─────────────────────────────────────────────────────────
GIT_CHANGED=$(git status --short 2>/dev/null | awk '{print $2}')

if [ -z "$GIT_CHANGED" ]; then
  exit 0
fi

# ── 过滤出"开发文件"变动（排除文档和 .claude/ 自身）────────────────────────
DEV_CHANGED=$(echo "$GIT_CHANGED" | grep -vE "^(lexicon-docs/|CLAUDE\.md$|\.claude/|CHANGELOG)")

if [ -z "$DEV_CHANGED" ]; then
  exit 0
fi

# ── 细分变动类型 ─────────────────────────────────────────────────────────────
SRC_COMPONENTS=$(echo "$DEV_CHANGED" | grep -E "^src/components/")
SRC_SERVICES=$(echo "$DEV_CHANGED" | grep -E "^src/services/")
SRC_STORES=$(echo "$DEV_CHANGED" | grep -E "^src/stores/")
SRC_TYPES=$(echo "$DEV_CHANGED" | grep -E "^src/types/")
SRC_HOOKS=$(echo "$DEV_CHANGED" | grep -E "^src/hooks/")
SRC_OTHER=$(echo "$DEV_CHANGED" | grep -E "^src/" | grep -vE "^src/(components|services|stores|types|hooks)/")

CONFIG_CHANGED=$(echo "$DEV_CHANGED" | grep -E "(vite\.config|tailwind\.config|tsconfig|package\.json|capacitor\.config)")
SCRIPTS_CHANGED=$(echo "$DEV_CHANGED" | grep -E "^scripts/")
OTHER_ROOT=$(echo "$DEV_CHANGED" | grep -vE "^(src/|scripts/)" )

# ── 检测各文档是否已更新（相对上次 commit）───────────────────────────────────
doc_changed() {
  local file="$1"
  git diff HEAD -- "$file" 2>/dev/null | grep -q "^+" && return 0
  git status --short -- "$file" 2>/dev/null | grep -qE "^\?\?" && return 0
  return 1
}

CHANGELOG_OK=false
DOC01_OK=false
DOC02_OK=false
DOC03_OK=false
DOC04_OK=false
DOC05_OK=false
DOC06_OK=false
CLAUDE_MD_OK=false

doc_changed "$REPO_ROOT/lexicon-docs/CHANGELOG.md"      && CHANGELOG_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/01-architecture.md" && DOC01_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/02-ui-design.md"    && DOC02_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/03-database.md"     && DOC03_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/04-ai-schema.md"    && DOC04_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/05-components.md"   && DOC05_OK=true
doc_changed "$REPO_ROOT/lexicon-docs/06-crossplatform.md" && DOC06_OK=true
doc_changed "$REPO_ROOT/CLAUDE.md"                       && CLAUDE_MD_OK=true

# ── 构建待更新文档清单 ──────────────────────────────────────────────────────
TASKS=()

# CHANGELOG 是所有变动的必须项
if [ "$CHANGELOG_OK" = false ]; then
  TASKS+=("CHANGELOG: 在 lexicon-docs/CHANGELOG.md 顶部追加今日条目，记录本轮所有改动（新增/修改/修复）。同时检查本轮对话是否有用户反馈或决策需要一并记录。")
fi

# src/components → 05
if [ -n "$SRC_COMPONENTS" ] && [ "$DOC05_OK" = false ]; then
  TASKS+=("05-COMPONENTS: 更新 lexicon-docs/05-components.md，反映组件树/Props 接口变动")
fi

# src/hooks → 05
if [ -n "$SRC_HOOKS" ] && [ "$DOC05_OK" = false ]; then
  TASKS+=("05-HOOKS: 更新 lexicon-docs/05-components.md，反映 Hook 定义变动")
fi

# src/stores → 05
if [ -n "$SRC_STORES" ] && [ "$DOC05_OK" = false ]; then
  TASKS+=("05-STORES: 更新 lexicon-docs/05-components.md，反映 Store schema 变动")
fi

# src/services/db → 03
if echo "$SRC_SERVICES" | grep -q "db" && [ "$DOC03_OK" = false ]; then
  TASKS+=("03-DATABASE: 更新 lexicon-docs/03-database.md，反映数据库/存储层变动")
fi

# src/services/ai → 04
if echo "$SRC_SERVICES" | grep -q "ai" && [ "$DOC04_OK" = false ]; then
  TASKS+=("04-AI: 更新 lexicon-docs/04-ai-schema.md，反映 AI prompt/schema 变动")
fi

# src/types → 01
if [ -n "$SRC_TYPES" ] && [ "$DOC01_OK" = false ]; then
  TASKS+=("01-TYPES: 更新 lexicon-docs/01-architecture.md 中的全局 TypeScript 类型定义")
fi

# src/components 样式/布局变动 → 02
if [ -n "$SRC_COMPONENTS" ] && [ "$DOC02_OK" = false ]; then
  TASKS+=("02-UI: 检查 lexicon-docs/02-ui-design.md 是否需要更新（组件视觉/交互变动）")
fi

# tailwind.config 变动 → 02（颜色 token、断点等）
if echo "$CONFIG_CHANGED" | grep -q "tailwind" && [ "$DOC02_OK" = false ]; then
  TASKS+=("02-TAILWIND: 更新 lexicon-docs/02-ui-design.md，反映颜色 token/样式配置变动")
fi

# 配置文件变动 → 01（技术栈/依赖/构建配置）
if [ -n "$CONFIG_CHANGED" ] && [ "$DOC01_OK" = false ]; then
  TASKS+=("01-CONFIG: 更新 lexicon-docs/01-architecture.md，反映构建配置/依赖变动")
fi

# Capacitor/Tauri 相关 → 06
if echo "$CONFIG_CHANGED" | grep -q "capacitor" && [ "$DOC06_OK" = false ]; then
  TASKS+=("06-CROSSPLATFORM: 更新 lexicon-docs/06-crossplatform.md，反映跨平台配置变动")
fi

# scripts/ 变动 → 按内容判断（MDX 转换脚本 → 03）
if [ -n "$SCRIPTS_CHANGED" ] && [ "$DOC03_OK" = false ]; then
  TASKS+=("03-SCRIPTS: 检查 lexicon-docs/03-database.md 是否需要更新（词库转换脚本变动）")
fi

# 架构级变动（types、config、services 核心接口）→ CLAUDE.md
ARCH_CHANGED=false
if [ -n "$SRC_TYPES" ] || [ -n "$CONFIG_CHANGED" ]; then
  ARCH_CHANGED=true
fi
if echo "$SRC_SERVICES" | grep -qE "(db|ai)\." 2>/dev/null; then
  ARCH_CHANGED=true
fi

if [ "$ARCH_CHANGED" = true ] && [ "$CLAUDE_MD_OK" = false ]; then
  TASKS+=("CLAUDE.MD: 更新 CLAUDE.md 的「当前开发状态」和「已知问题」区块")
fi

# ── 输出 ─────────────────────────────────────────────────────────────────────
if [ ${#TASKS[@]} -eq 0 ]; then
  exit 0
fi

echo "[文档同步 Hook 自动触发]"
echo ""
echo "检测到以下开发文件有变动但文档未同步："
echo "$DEV_CHANGED" | sed 's/^/  - /'
echo ""
echo "请立即执行以下文档更新（按顺序），完成后简短汇报改了什么："
echo ""
for i in "${!TASKS[@]}"; do
  echo "  $((i+1)). ${TASKS[$i]}"
done
echo ""
echo "更新顺序：CHANGELOG → 设计文档 → CLAUDE.md。不要询问用户，直接操作。"
