# AI Thinking State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户说对一轮台词后，先显示 1.2 秒的“思考中…”状态，再按剧本顺序显示对方回复。

**Architecture:** 保持 `core.ts` 的严格匹配逻辑不变，把“思考中”当成界面层的临时状态加在 `App.tsx`。这样不会破坏现有的剧本、回合、错词重置逻辑，只是在成功完成一轮后延迟渲染对方消息。

**Tech Stack:** React、TypeScript、Vitest、Testing Library

---

### Task 1: 先写失败测试

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`
- Test: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`

- [ ] **Step 1: 写一条失败测试**

```tsx
it('shows a lightweight thinking state before the scripted reply appears', async () => {
  vi.useFakeTimers();
  // 准备一个一问一答剧本
  // 发送正确内容后，先断言“思考中”出现
  // 再断言正式回复此时还没出现
  // 快进 1200ms 后，断言“思考中”消失，正式回复出现
});
```

- [ ] **Step 2: 运行单测确认它先失败**

Run: `npm test -- --runInBand tests/app.test.tsx`
Expected: FAIL，因为当前界面还没有“思考中”状态。

### Task 2: 加最小实现

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/src/App.tsx`
- Modify: `G:/wechat-rehearsal-pwa/src/styles.css`
- Test: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`

- [ ] **Step 1: 在 `App.tsx` 里增加轻量状态**

```tsx
const [thinkingTurnIndex, setThinkingTurnIndex] = useState<number | null>(null);
```

- [ ] **Step 2: 正确完成一轮后先显示“思考中”**

```tsx
if (result.kind === 'turn-complete' || result.kind === 'completed') {
  setThinkingTurnIndex(currentTurnIndex);
  window.setTimeout(() => {
    setThinkingTurnIndex(null);
    setRehearsal(result.nextState);
  }, 1200);
  return;
}
```

- [ ] **Step 3: 把正式回复延后到思考结束后出现**

```tsx
// 需要先拿到“不带对方回复”的中间状态
// 再在超时结束后切换到包含对方回复的最终状态
```

- [ ] **Step 4: 补“思考中…”的小行样式**

```css
.thinking-row {
  font-size: 13px;
  color: var(--text-faint);
}
```

### Task 3: 回归验证

**Files:**
- Modify: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`
- Test: `G:/wechat-rehearsal-pwa/tests/app.test.tsx`

- [ ] **Step 1: 再跑单测看转绿**

Run: `npm test -- --runInBand tests/app.test.tsx`
Expected: PASS

- [ ] **Step 2: 跑完整验证**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npm run test:e2e`
Expected: PASS
