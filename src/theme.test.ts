import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// 主题工作室的静态闸：保存必须带上 dark，而且 dark 必须来自模型的判断。
//
// ⚠️ 这个 bug 真发生过：dark 是底座（night/sky）的唯一依据，而初版既没读模型的 dark、
// 保存时也不带它 —— 生成一个深色主题，预览是浅色、存下来还是浅色，看起来像「主题没生效」，
// 而不是像「某个字段丢了」。两个判据分别对着那条链的两半。
const STUDIO = readFileSync(join(import.meta.dirname, 'PageSettings.tsx'), 'utf8');

/** 这份源码有没有把模型的 dark 一路带到保存。
 *
 * ⚠️ 判据落在这两处，而不是「源码里有没有 res.dark」：core 的 generateTheme 返回类型
 * 里还没有 dark，取值必须带一次断言（(res as { dark?: boolean }).dark），所以字面量
 * res.dark 本来就不会出现 —— 第一版闸就是这么误报的。真正要盯的是「预览的状态里带着
 * dark」且「保存传的是 preview.dark」：缺一条，深色主题就会存成浅色。 */
function keepsTheModelsDark(src: string): boolean {
  const previewKeepsIt = /setPreview\(\{[^}]*\bdark\b/.test(src);
  const savePassesIt = /saveTheme\(\{[^}]*\bdark:\s*preview\.dark\b/.test(src);
  return previewKeepsIt && savePassesIt;
}

describe('主题工作室不会丢掉 dark', () => {
  it('读模型的 dark，保存时带上它', () => {
    expect(keepsTheModelsDark(STUDIO)).toBe(true);
  });

  // 闸自己也要有反例，否则「改坏了它照样绿」没人会发现。
  it('the check itself bites on the shape this bug had', () => {
    const before = 'await api.saveTheme({ name, base: aiBase || undefined, variables: preview.variables });';
    const after = 'setPreview({ variables, name, editingId, dark }); await api.saveTheme({ name, base, dark: preview.dark, variables });';
    expect(keepsTheModelsDark(before)).toBe(false);
    expect(keepsTheModelsDark(after)).toBe(true);
  });
});
