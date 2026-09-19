# Lexicon 浏览器扩展隐私说明 / Browser Extension Privacy Notice

更新日期 / Last updated: 2026-09-18

Lexicon 不运营账号系统，也不会把浏览历史、网页正文或查词历史发送给开发者。扩展仅在用户主动选择文本或发起查询时处理必要数据。

Lexicon does not operate accounts and does not send browsing history, page contents, or lookup history to the developer. Data is processed only when the user selects text or initiates a lookup.

## 数据处理 / Data handling

- 网页选词只读取用户当前选中的文本，不读取或上传整页正文。
- 设置、历史、AI 缓存和下载词典保存在浏览器本地存储或 OPFS。
- 只有用户自行配置并启用后，请求才会发往其选择的 AI endpoint、Tavily 或 Brave Search；API Key 仅保存在本地。
- 联网配图失败时，Service Worker 可代取本次查询返回的图片 URL，不会扫描页面图片。
- 不出售数据，不投放广告，不做跨站跟踪。

## 权限用途 / Permission use

- sidePanel: 显示 Lexicon 界面。
- storage: 保存选词开关、主题镜像与待查文本。
- contextMenus: 提供选中文本的右键查词入口。
- all URLs / host access: 显示可关闭的选词按钮；代理用户配置的 AI endpoint、搜索 API 与查询结果图片。不会读取网页正文。