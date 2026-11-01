/* Copy for fingerprint unlock (en / es). Kept apart from copy.ts. */
import { useCallback } from "react";
import { useJournal } from "./store";

const BIO = {
  en: {
    touchTitle: "Welcome back",
    touchBody: "Touch the sensor to open your journal.",
    touchBtn: "Unlock with fingerprint",
    touchAsking: "Waiting for your fingerprint…",
    touchRetry: "Tap the fingerprint to try again.",
    usePass: "Use passphrase instead",
    useFinger: "Use fingerprint",
    touchFallback: "The fingerprint didn't work a few times. Enter your passphrase, or try the fingerprint again.",
    offerTitle: "Unlock with your fingerprint next time",
    offerBody: "Skip typing the passphrase on this phone. Your fingerprint opens a sealed copy of it, and the passphrase still works any time.",
    offerSafe: "Stays on this phone · never uploaded",
    offerYes: "Use fingerprint",
    offerLater: "Not now",
    offerNever: "Don't ask on this device",
    setTitle: "Fingerprint unlock",
    setOnBody: "On for this phone. Vela asks for your fingerprint when it opens or locks; your passphrase still works any time.",
    setOffBody: "Open Vela with a fingerprint instead of typing the passphrase. A sealed copy of the passphrase stays on this device only, and only your fingerprint opens it. Nothing extra is uploaded.",
    setNeedPass: "Enter your passphrase once to turn it on.",
    setTurnOn: "Turn on",
    setNoSensor: "This phone has no fingerprint or screen lock that Vela can use. Set one up in the phone's settings, then come back.",
    rewrapped: "Passphrase changed — fingerprint still works.",
    rewrapLost: "Passphrase changed. Turn fingerprint on again in Settings.",
    bioOff: "Fingerprint unlock turned off on this device.",
  },
  es: {
    touchTitle: "Hola de nuevo",
    touchBody: "Toca el sensor para abrir tu diario.",
    touchBtn: "Desbloquear con huella",
    touchAsking: "Esperando tu huella…",
    touchRetry: "Toca la huella para intentarlo de nuevo.",
    usePass: "Usar la frase de contraseña",
    useFinger: "Usar la huella",
    touchFallback: "La huella no funcionó varias veces. Escribe tu frase o vuelve a intentar con la huella.",
    offerTitle: "Desbloquea con tu huella la próxima vez",
    offerBody: "Deja de escribir la frase en este teléfono. Tu huella abre una copia sellada, y la frase sigue funcionando siempre.",
    offerSafe: "Se queda en este teléfono · nunca se sube",
    offerYes: "Usar la huella",
    offerLater: "Ahora no",
    offerNever: "No volver a preguntar aquí",
    setTitle: "Desbloqueo con huella",
    setOnBody: "Activo en este teléfono. Vela pide tu huella al abrirse o bloquearse; tu frase sigue funcionando siempre.",
    setOffBody: "Abre Vela con la huella en lugar de escribir la frase. Una copia sellada de la frase se queda solo en este dispositivo y solo tu huella la abre. No se sube nada más.",
    setNeedPass: "Escribe tu frase una vez para activarla.",
    setTurnOn: "Activar",
    setNoSensor: "Este teléfono no tiene huella ni bloqueo de pantalla que Vela pueda usar. Configúralo en los ajustes del teléfono y vuelve.",
    rewrapped: "Frase cambiada: la huella sigue funcionando.",
    rewrapLost: "Frase cambiada. Vuelve a activar la huella en Ajustes.",
    bioOff: "Desbloqueo con huella desactivado en este dispositivo.",
  },
} as const;

export type BioKey = keyof typeof BIO.en;

export function useBioT() {
  const lang = useJournal((s) => s.journal.settings.language);
  return useCallback((key: BioKey) => (BIO[lang as "en" | "es"] ?? BIO.en)[key], [lang]);
}

export function bioText(key: BioKey) {
  const lang = useJournal.getState().journal.settings.language as "en" | "es";
  return (BIO[lang] ?? BIO.en)[key];
}
