import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 切语言的闸：本地选择与后端会话语言必须一起写。
//
// ⚠️ 这是「mood 砖语言跟不上」那个 bug 的机器化版本。语言同时存在两处：
//   - 本地：core 的 i18n.ts，localStorage['daycore.locale']，boot() 下次从它建目录
//   - 后端：会话语言，凡后端渲染好再交给前端的字符串都跟着它（GET /api/mood/kinds
//     的 name 就是：同一会话 zh-CN 时回「开心」，PATCH 成 en-US 后回「Happy」）
// 只写一处的两种偏法都真实出现过，而且各自看起来像别的问题：
//   只写本地 → 界面换了、mood 砖没换 → 像漏翻译，补语言包永远补不好；
//   只写后端 → 设置屏说「重载后生效」，重载后 boot() 取不到本地选择，退回浏览器
//             语言 → 像这个开关自己弹回去了。
// 所以判据是成对的：每个 chooseLocale( 调用点近处要有一条 patchSettings({language})，
// 反过来也一样。
//
// 只放行首屏/救援屏：那两屏跑在后端接上之前（main.tsx 的 booting/failed 分支），
// 此刻还没有会话可写、后端也未必在。
const PRE_BOOT = new Set(['Setting.tsx']);

const WINDOW = 400;
const CALLS_LOCAL = /\bchooseLocale\(/g;
const TELLS_SERVER = /patchSettings\(\s*\{[^}]*\blanguage\b/g;
const CALLS_LOCAL_ONE = /\bchooseLocale\(/;
const TELLS_SERVER_ONE = /patchSettings\(\s*\{[^}]*\blanguage\b/;

/** 去掉注释再判：注释里提到 chooseLocale() 不该算一个调用点 —— 这个闸的第一版
 *  就是被自己上面那段说明文字判红的。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 这份源码里成对写坏的调用点。 */
function divergence(raw: string): string[] {
  const text = stripComments(raw);
  const out: string[] = [];
  CALLS_LOCAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALLS_LOCAL.exec(text)) !== null) {
    if (!TELLS_SERVER_ONE.test(text.slice(m.index, m.index + WINDOW))) out.push('only-local@' + m.index);
  }
  TELLS_SERVER.lastIndex = 0;
  let k: RegExpExecArray | null;
  while ((k = TELLS_SERVER.exec(text)) !== null) {
    const back = text.slice(Math.max(0, k.index - WINDOW), k.index);
    const fwd = text.slice(k.index, k.index + WINDOW);
    if (!CALLS_LOCAL_ONE.test(back) && !CALLS_LOCAL_ONE.test(fwd)) out.push('only-server@' + k.index);
  }
  return out;
}

function sources(): { file: string; text: string }[] {
  return readdirSync(import.meta.dirname)
    .filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))
    .map((n) => ({ file: n, text: readFileSync(join(import.meta.dirname, n), 'utf8') }));
}

describe('language switch', () => {
  it('every language switch writes both sides', () => {
    const bad = sources()
      .filter((s) => !PRE_BOOT.has(s.file))
      .map((s) => ({ file: s.file, problems: divergence(s.text) }))
      .filter((s) => s.problems.length > 0)
      .map((s) => s.file + ' → ' + s.problems.join(', '));
    expect(bad).toEqual([]);
  });

  // 闸自己也要有反例，否则「写坏了它照样绿」这件事没人会发现。两条正是上面那两种
  // 真实出现过的偏法。
  it('the check itself bites on both shapes this bug had', () => {
    const onlyLocal = 'onClick={() => { api.chooseLocale(l); location.reload(); }}';
    const onlyServer = 'const f = (l) => { void api.patchSettings({ language: l }); };';
    const both = 'api.chooseLocale(l); void api.patchSettings({ language: l });';
    expect(divergence(onlyLocal)).toHaveLength(1);
    expect(divergence(onlyLocal)[0]).toContain('only-local');
    expect(divergence(onlyServer)).toHaveLength(1);
    expect(divergence(onlyServer)[0]).toContain('only-server');
    expect(divergence(both)).toEqual([]);
  });

  it('the allowlist only names files that still exist and still switch locally', () => {
    const all = sources();
    for (const f of PRE_BOOT) {
      const hit = all.find((s) => s.file === f);
      expect(hit, f + ' 不在了：把 PRE_BOOT 里那条一起删掉').toBeTruthy();
      expect(CALLS_LOCAL_ONE.test(stripComments(hit!.text)), f + ' 已经不切语言了：把豁免删掉').toBe(true);
    }
  });
});
