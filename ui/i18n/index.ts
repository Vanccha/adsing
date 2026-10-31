// i18n: arayüz metni locales/ui, motor anahtarları locales/engine ve vaka metinleri cases/i18n dosyalarından yüklenir.
// Anahtarlar düz (nokta içeren) dizgelerdir; eksik anahtar olduğu gibi gösterilir.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const LANGS = ['tr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

type Dict = Record<string, string>;

function flatten(obj: unknown, prefix = '', out: Dict = {}): Dict {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') out[key] = v;
      else flatten(v, key, out);
    }
  }
  return out;
}

const uiFiles = import.meta.glob('../../locales/ui/*.json', { eager: true, import: 'default' });
const engineFiles = import.meta.glob('../../locales/engine/*.json', { eager: true, import: 'default' });
const caseFiles = import.meta.glob('../../cases/i18n/*.json', { eager: true, import: 'default' });

function pick(files: Record<string, unknown>, lang: Lang): Dict {
  const entry = Object.entries(files).find(([p]) => p.endsWith(`/${lang}.json`));
  return entry ? flatten(entry[1]) : {};
}

export function dictFor(lang: Lang): Dict {
  return { ...pick(caseFiles, lang), ...pick(engineFiles, lang), ...pick(uiFiles, lang) };
}

const STORE_KEY = 'adsing.lang';
function storedLang(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'tr' || v === 'en') return v;
  } catch {
    /* depolama yok */
  }
  return 'tr';
}

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    /* yok say */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

let started = false;
export function initI18n(lang: Lang = storedLang()) {
  if (started) return i18n;
  started = true;
  void i18n.use(initReactI18next).init({
    resources: { tr: { translation: dictFor('tr') }, en: { translation: dictFor('en') } },
    lng: lang,
    fallbackLng: 'tr',
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    initAsync: false,
  });
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return i18n;
}

export { i18n };
