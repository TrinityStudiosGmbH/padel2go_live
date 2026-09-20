import { lazy, type ComponentType } from "react";

/**
 * lazy(), das einen Deploy übersteht.
 *
 * Die Seite ist in 68 nachgeladene Routen zerlegt, deren Dateinamen einen
 * Inhalts-Hash tragen. Rollt ein Deploy aus, während jemand die Seite offen
 * hat, verschwinden die alten Dateien. Klickt die Person dann auf eine Route,
 * die sie noch nicht besucht hat, fordert der Browser einen Dateinamen an, den
 * es nicht mehr gibt. Vercel liefert für alles Unbekannte index.html aus — der
 * Browser bekommt also HTML statt JavaScript und bricht ab mit
 * "'text/html' is not a valid JavaScript MIME type". Der Nutzer sieht einen
 * Fehlerbildschirm, obwohl nichts kaputt ist.
 *
 * Hier wird genau dieser Fall abgefangen und die Seite einmal neu geladen —
 * dann zieht sie die aktuellen Dateinamen. Das Flag in sessionStorage
 * verhindert eine Schleife, falls der Fehler eine andere Ursache hat.
 */
const RELOAD_FLAG = "p2g_chunk_reload";

function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /MIME type/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Geklappt — ein etwaiges Flag aus einem früheren Versuch zurücksetzen.
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* egal */ }
      return mod;
    } catch (err) {
      let alreadyTried = false;
      try { alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* egal */ }

      if (isStaleChunkError(err) && !alreadyTried) {
        try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* egal */ }
        window.location.reload();
        // Nie erreicht, hält aber die Suspense-Grenze ruhig, bis neu geladen ist.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
