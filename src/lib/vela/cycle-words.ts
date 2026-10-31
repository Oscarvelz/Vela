import { useCallback } from "react";
import type { CopyKey } from "./copy";
import type { CycleStage } from "./cycle";
import { useT } from "./i18n";
import { selectActiveCycle, useJournal } from "./store";

/** Phrases that change with the tracking perspective ("I track my own" vs "I follow my partner's"). */
export type CycleWordKey = "cyTitle" | "cyPeriodStarted" | "cyPeriodEnded" | "cyFirstTitle" | "cyFirstBody" | "cyMarkStart" | "cyMarkEnd";

const SELF: Record<CycleWordKey, CopyKey> = {
  cyTitle: "cycleTitle",
  cyPeriodStarted: "cyPeriodStarted",
  cyPeriodEnded: "cyPeriodEnded",
  cyFirstTitle: "cyFirstTitle",
  cyFirstBody: "cyFirstBody",
  cyMarkStart: "cyMarkStart",
  cyMarkEnd: "cyMarkEnd",
};

export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (key in values ? String(values[key]) : `{${key}}`));
}

export function useCycleWords() {
  const t = useT();
  const perspective = useJournal((s) => selectActiveCycle(s).perspective);
  const name = useJournal((s) => selectActiveCycle(s).partnerName).trim();
  const partner = perspective === "partner";
  const w = useCallback(
    (key: CycleWordKey) => {
      if (!partner) return t(SELF[key]);
      return name ? fill(t(`${key}N` as CopyKey), { name }) : t(`${key}P` as CopyKey);
    },
    [t, partner, name],
  );
  return { partner, w, t };
}

const STAGE_KEY: Record<CycleStage, CopyKey> = {
  period: "cyStagePeriod",
  follicular: "cyStageFollicular",
  fertile: "cyStageFertile",
  ovulation: "cyStageOvulation",
  luteal: "cyStageLuteal",
  late: "cyStageLate",
};

const DISCREET_KEY: Record<CycleStage, CopyKey> = {
  period: "cyDiscPeriod",
  follicular: "cyDiscFollicular",
  fertile: "cyDiscFertile",
  ovulation: "cyDiscOvulation",
  luteal: "cyDiscLuteal",
  late: "cyDiscLate",
};

export function stageKey(stage: CycleStage, discreet = false) {
  return discreet ? DISCREET_KEY[stage] : STAGE_KEY[stage];
}

/** Short name for a tracker in switchers, the header pill and legends: the partner's name, else "Me" / "Partner". */
export function trackerLabel(tracker: { perspective: string; partnerName: string; partnerLink?: string }, t: (key: CopyKey) => string) {
  if (tracker.perspective !== "partner") return t("cyMe");
  return (tracker.partnerLink || tracker.partnerName || "").trim() || t("cyPartnerUnnamed");
}
