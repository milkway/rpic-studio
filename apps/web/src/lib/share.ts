// Compartilhamento por URL sem servidor: o código vai comprimido (lz-string)
// no fragment (#pic=…), que nunca é enviado ao servidor — privacidade e zero
// limite de proxy/log. Paridade com o pikup (que usa ?pik= na query).
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export interface SharedState {
  source: string;
  circuits: boolean;
}

/** Monta o fragment `#pic=…[&circuits=1]` para a URL de compartilhamento. */
export function encodeShareHash(state: SharedState): string {
  const pic = compressToEncodedURIComponent(state.source);
  return `#pic=${pic}${state.circuits ? "&circuits=1" : ""}`;
}

/** Decodifica um fragment de URL; retorna null se não houver `pic=` válido. */
export function decodeShareHash(hash: string): SharedState | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    // Parse manual: URLSearchParams converteria "+" (válido no alfabeto do
    // lz-string) em espaço e corromperia payloads grandes.
    const match = /(?:^|&)pic=([^&]*)/.exec(raw);
    if (!match || !match[1]) return null;
    const source = decompressFromEncodedURIComponent(match[1]);
    if (source === null || source === "") return null;
    return { source, circuits: /(?:^|&)circuits=1(?:&|$)/.test(raw) };
  } catch {
    return null;
  }
}

/** URL completa de compartilhamento para o estado atual. */
export function buildShareUrl(state: SharedState): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${encodeShareHash(state)}`;
}
