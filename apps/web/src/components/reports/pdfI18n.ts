import React from 'react';
import type { TFunction } from 'i18next';
import i18n from '@/lib/i18n';
import { currentLanguage } from '@/lib/i18n/currentLanguage';

/**
 * PDF reports are rendered by @react-pdf/renderer via `pdf(<Doc />).toBlob()`, outside the
 * app's React tree, so they resolve text with a translator fixed to one language instead of
 * `useTranslation()`. The language defaults to the UI's current language.
 */
export type PdfLanguage = 'en' | 'es';

/** Translator for the `common` namespace, fixed to `language` (default: current UI language). */
export const getPdfT = (language?: PdfLanguage): TFunction =>
  i18n.getFixedT(language ?? currentLanguage(), 'common') as TFunction;

/** BCP-47 locale for dates rendered inside a PDF. */
export const pdfLocale = (language?: PdfLanguage): string =>
  (language ?? currentLanguage()) === 'es' ? 'es-CO' : 'en-US';

/** Lets a PDF document hand its language to shared layout components. */
export const PdfLanguageContext = React.createContext<PdfLanguage | undefined>(undefined);

/** Language from the nearest PdfLanguageContext, or the current UI language when none is provided. */
export const usePdfLanguage = (): PdfLanguage => React.useContext(PdfLanguageContext) ?? currentLanguage();

/** Translator fixed to the PDF's language (see usePdfLanguage). */
export const usePdfT = (): TFunction => getPdfT(usePdfLanguage());
