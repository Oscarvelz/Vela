import { useCallback } from "react";
import { STR, type CopyKey } from "./copy";
import { useJournal } from "./store";

export function useT() {
  const lang = useJournal((s) => s.journal.settings.language);
  return useCallback((key: CopyKey) => STR[lang][key], [lang]);
}

export function useLang() {
  return useJournal((s) => s.journal.settings.language);
}
