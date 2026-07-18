修复 AI 问答界面死循环渲染崩溃的严重 React 渲染错误
1. 修复：彻底修复了在切换旧词条时，由于 Zustand Store 选择器默认返回新数组引用而引发的死循环 React 渲染崩溃错误（React Error #185）。
