import type { CustomTheme } from '@daycore/core';

// 主题怎么落到页面上。
//
// 内置主题是 CSS 属性选择器（theme.css 里的 [data-theme='sunset'] 之类）；
// 自定义主题反过来 —— 后端存的是变量，前端把变量逐条写进 :root。两者的
// 区别不是风格，是数据在哪：GET /api/themes 只回内置 id，不回它们的值，所以
// 值只能由本端的样式表承载；自定义主题的值存在库里的 variables 上。

/** 内置主题 id。后端 /api/themes 的 builtin 就是这个闭集。 */
export const BUILTIN_THEMES = ['sky', 'sunset', 'night', 'nature'] as const;

/**
 * 自定义主题继承底座的 id。深色 → night；否则用声明过的 base，没有就 sky。
 *
 * ⚠️ base 由后端校验为内置 id 之一，dark 是布尔 —— 这里只是把这个规则集中到
 * 一处，让「底座怎么算」成为可测试的纯函数，而不是散在组件里。
 */
export function customThemeBase(t: { dark: boolean; base?: string }): string {
  return t.dark ? 'night' : t.base || 'sky';
}

/**
 * 把一个会话主题落到 <html>。
 *
 * 先清掉上一个自定义主题留下的 inline 覆盖（否则切回内置时旧颜色还挂着），
 * 再决定走哪条路：
 *   - 自定义：data-theme 指向底座，variables 逐条 style.setProperty 到 :root；
 *   - 内置：data-theme 指向 id 本身；
 *   - 认不出来的 id（后端比这份界面新）：回落到 sky，而不是挂着空主题。
 */
export function applyTheme(id: string, themes: CustomTheme[]): void {
  const root = document.documentElement;
  const props = Array.from(root.style);
  for (const p of props) if (p.startsWith('--')) root.style.removeProperty(p);

  const custom = themes.find((th) => th.id === id);
  if (custom) {
    root.setAttribute('data-theme', customThemeBase(custom));
    for (const [k, v] of Object.entries(custom.variables)) root.style.setProperty(k, v);
    return;
  }
  root.setAttribute('data-theme', (BUILTIN_THEMES as readonly string[]).includes(id) ? id : 'sky');
}
