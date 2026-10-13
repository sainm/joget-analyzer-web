import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate } from './i18n.js';

const KEY = 'joget-analyzer-lang';

/**
 * 默认语言：先看用户上次的选择，其次跟随浏览器语言。
 *
 * 本工具最终交付日本使用，所以浏览器是 ja-* 时默认进日文界面；
 * 其他语言（含中文）回落中文，两边都不用改设置。
 */
function detectLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'ja') return saved;
  } catch (e) { /* ignore */ }
  try {
    const list = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || ''];
    if (list.some((l) => /^ja\b/i.test(String(l)))) return 'ja';
  } catch (e) { /* ignore */ }
  return 'zh';
}

const Ctx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  useEffect(() => {
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang === 'ja' ? 'ja' : 'zh-CN';
    document.title = translate(lang, 'app.title');
  }, [lang]);

  const setLang = useCallback((l) => setLangState(l === 'ja' ? 'ja' : 'zh'), []);
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) return { lang: 'zh', setLang: () => {}, t: (k) => k };
  return ctx;
}

/** 由当前界面语言推导产物语言（设计书等） */
export function docLang(lang) {
  return lang === 'ja' ? 'ja' : 'zh';
}
