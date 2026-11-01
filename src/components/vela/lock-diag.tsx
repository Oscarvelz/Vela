/* "Lock diagnostics": yes/no facts about what this phone holds for the lock, so a "why did it ask for my
   passphrase?" can be answered from a screenshot. No ids, keys, passphrases, emails or journal data. */
import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { useJournal } from "@/lib/vela/store";
import { useBioT, type BioKey } from "@/lib/vela/bio-copy";
import { lockFacts } from "@/lib/vela/app-lock";
import { bioForUser, bioKeyPresent, bioRecord, bioSupported, storagePersisted } from "@/lib/vela/fingerprint";
import { graceFacts } from "@/lib/vela/grace";
import { lastUser } from "@/lib/vela/cloud";
import { useCloud } from "@/lib/vela/sync";

type Fact = { k: BioKey; v: string };

const BUILD = (() => {
  try {
    return new URL(import.meta.url).pathname.split("/").pop()?.replace(/\.js$/, "") || "dev";
  } catch {
    return "dev";
  }
})();

export function useLockFacts(open: boolean) {
  const bt = useBioT();
  const vault = useJournal((s) => s.vault);
  const vaultId = useJournal((s) => s.vaultId);
  const keyParked = useJournal((s) => s.keyParked);
  const user = useCloud((s) => s.user);
  const [facts, setFacts] = useState<Fact[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const yn = (v: boolean | null | undefined) => (v === null || v === undefined ? bt("diagUnknown") : v ? bt("diagYes") : bt("diagNo"));
    void (async () => {
      const g = await graceFacts(vaultId);
      const seal = bioRecord();
      const sealKey = await bioKeyPresent();
      const persisted = await storagePersisted();
      const lf = lockFacts();
      let standalone: boolean | null = null;
      try {
        standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches;
      } catch {
        standalone = null;
      }
      const out: Fact[] = [
        { k: "diagJournal", v: vault === "unavailable" ? bt("diagUnknown") : yn(vault === "locked") },
        { k: "diagKey", v: `${yn(g.parked)}${g.parked ? ` · ${g.forThis ? "✓" : "≠"}` : ""}${keyParked ? "" : " · -"}` },
        { k: "diagSeal", v: seal ? `${bt("diagYes")} · ${seal.prf ? "prf" : "device"} · ${bioForUser(vaultId) ? "✓" : "≠"}` : bt("diagNo") },
        { k: "diagSealKey", v: yn(sealKey) },
        { k: "diagCred", v: lf.source === "none" ? bt("diagNo") : `${bt("diagYes")} · ${lf.source}` },
        { k: "diagOwner", v: lf.owner },
        { k: "diagUid", v: yn(Boolean(lastUser())) },
        { k: "diagSigned", v: yn(Boolean(user)) },
        { k: "diagPersist", v: yn(persisted) },
        { k: "diagStandalone", v: yn(standalone) },
        { k: "diagAppLock", v: `${yn(lf.appLock)}${bioSupported() ? "" : " · webauthn ✗"}` },
        { k: "diagMigrated", v: yn(lf.migrated) },
        { k: "diagBuild", v: BUILD },
      ];
      if (live) setFacts(out);
    })();
    return () => {
      live = false;
    };
  }, [open, vault, vaultId, keyParked, user, bt]);
  return facts;
}

export function LockDiagnostics({ startOpen = false }: { startOpen?: boolean }) {
  const bt = useBioT();
  const [open, setOpen] = useState(startOpen);
  const [copied, setCopied] = useState(false);
  const facts = useLockFacts(open);
  return (
    <details
      className="vela-diag rounded-control border border-border px-3 py-2 text-sm"
      data-testid="lock-diag"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-dim">
        <Stethoscope className="size-4" /> <span>{bt("diagTitle")}</span>
      </summary>
      <p className="mt-1 text-xs text-dim">{bt("diagHint")}</p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs" data-testid="lock-diag-list">
        {facts.map((f) => (
          <div key={f.k} className="contents" data-fact={f.k}>
            <dt className="text-dim">{bt(f.k)}</dt>
            <dd className="text-right font-semibold" data-testid={`diag-${f.k}`}>
              {f.v}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="mt-2 min-h-9 text-xs text-dim underline underline-offset-4"
        onClick={() => {
          const text = facts.map((f) => `${bt(f.k)}: ${f.v}`).join("\n");
          void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined);
        }}
      >
        {copied ? bt("diagCopied") : bt("diagCopy")}
      </button>
    </details>
  );
}
