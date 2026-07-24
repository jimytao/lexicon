修复 iOS 语境灯泡与设置切回搜索卡顿/黑屏问题
1. 修复：AI Chat 完整语境灯泡在 iOS 键盘弹出后易被滚出视口；改为 nearest 滚动，并将唯一灯泡移至输入框旁。
2. 修复：本地词库 AI 模式未注入 enrichedContext，导致语境灯泡在该路径下不出现。
3. 修复：settingsStore 任意变更误卸载 sql.js 词库（30–46MB），设置页拨开关后再回搜索会强制重载；现仅在 activeDictionary 变化时卸库。
4. 优化：词库加载 in-flight 去重、换库 epoch/gate 防死锁与重复灌库；首屏后只预热当前一本词典。
5. 优化：底部 Dict/Image/Settings Tab 首次挂载后 hidden 保活，避免整树卸载导致的切页卡顿。
