import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, customThemeBase } from './theme';

// 自定义主题「底座怎么算」是这里唯一能离开 DOM 测的东西，但它正是 bug 发生
// 的地方：dark 和 base 同时给的时候，谁赢；base 缺省的时候落到哪。

describe('customThemeBase', () => {
  it('dark wins over a named base', () => {
    expect(customThemeBase({ dark: true, base: 'sunset' })).toBe('night');
  });

  it('falls back to sky when there is no base and it is not dark', () => {
    expect(customThemeBase({ dark: false })).toBe('sky');
  });

  it('keeps a named base when it is not dark', () => {
    expect(customThemeBase({ dark: false, base: 'sunset' })).toBe('sunset');
  });

  it('returns a base verbatim — the server already validated it is a builtin id', () => {
    // base 在 POST /api/themes 就被校验为内置 id 之一（handlers_themes.go），
    // 所以这里不该再猜。真来了一个不认识的值，data-theme 就指向它、无 CSS 规则，
    // 但那是数据错，不是这个纯函数能挡的。
    expect(customThemeBase({ dark: false, base: 'nature' })).toBe('nature');
    expect(BUILTIN_THEMES).toContain(customThemeBase({ dark: false, base: 'nature' }));
  });
});
