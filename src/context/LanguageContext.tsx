'use client';

import React, { createContext, useContext, useState } from 'react';
import { dictionaries, Language, Dictionary } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  t: Dictionary;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  t: dictionaries['en'],
  setLanguage: () => {},
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children, initialLanguage = 'en' }: { children: React.ReactNode, initialLanguage?: Language }) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage || 'en');

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, t: dictionaries[language] || dictionaries['en'], setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
