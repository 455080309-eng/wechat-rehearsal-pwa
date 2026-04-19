# AI 对话界面改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前排练工具的移动端界面改成黑白灰、豆包感、更像 AI 助手的中文对话体验，同时保留现有功能和测试通过状态。

**Architecture:** 这次改版不改数据结构和排练逻辑，重点调整 `App.tsx` 里的页面骨架和组件结构，以及 `styles.css` 里的整套视觉变量、卡片、气泡、顶部、抽屉、编辑面板、弹层和输入栏样式。测试以现有交互回归为主，补一条能反映新页面结构的 UI 测试，确保我们不是纯靠肉眼改。

**Tech Stack:** React、TypeScript、CSS、Vitest、Testing Library

---

### Task 1: 先用测试锁住新的页面骨架

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`

- [ ] 新增一条 UI 测试，验证首页会出现新的 AI 风格顶部标签和抽屉里的当前剧本标记
- [ ] 运行这条测试并确认它先失败

### Task 2: 重做页面骨架和图标

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/src/App.tsx`

- [ ] 把主页面顶部改成更轻的 AI 助手式头部，补齐统一的线性图标
- [ ] 调整抽屉、编辑页、按钮和卡片结构，让主页面和编辑页成为同一套视觉语言
- [ ] 保持现有交互和可访问性标签可用，避免把已有功能改坏

### Task 3: 用黑白灰语言统一所有视觉样式

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/src/styles.css`

- [ ] 建立新的黑白灰主题变量和背景层次
- [ ] 重做聊天气泡、输入栏、抽屉、编辑页、弹窗、Toast 和灯箱样式
- [ ] 保持移动端固定底栏、不整页乱滑、空白状态安静不打扰

### Task 4: 回归验证

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`

- [ ] 跑 `npm test`
- [ ] 跑 `npm run build`
- [ ] 如果测试或打包失败，先修到通过再结束
