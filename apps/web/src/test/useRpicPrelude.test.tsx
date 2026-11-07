// useRpic com o rpic REAL (WASM em Node) e a carga do prelude do dune
// controlada à mão: carga que FALHA não pode travar o editor (issue #17, revisão).
import { renderHook, waitFor } from "@testing-library/react";
import prelude from "virtual:dune-prelude";
import { useRpic } from "@/lib/useRpic";
import { dunePreludeLoaded, loadDunePrelude } from "@/lib/dunePrelude";
import { RLC_FIGURE } from "./fixtures-sim";

vi.mock("@/lib/rpic", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/rpic")>();
  const { ready } = await import("@strategicprojects/rpic");
  const { readFileSync: read } = await import("node:fs");
  const { createRequire: req } = await import("node:module");
  const wasm = req(import.meta.url).resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm");
  let p: Promise<void> | null = null;
  return { ...mod, ensureRpic: () => (p ??= ready(read(wasm))) };
});

vi.mock("@/lib/dunePrelude", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/dunePrelude")>();
  return { ...mod, loadDunePrelude: vi.fn(), dunePreludeLoaded: vi.fn() };
});

const load = vi.mocked(loadDunePrelude);
const loaded = vi.mocked(dunePreludeLoaded);
const opts = { circuits: true, texlabels: false };
const slow = { timeout: 4_000 };

beforeEach(() => {
  load.mockReset();
  loaded.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useRpic + prelude do dune", () => {
  it("carga que falha: limpa o errorDiag, cai no compile puro e tenta de novo na próxima edição", async () => {
    let have: string | null = null;
    loaded.mockImplementation(() => have);
    load.mockRejectedValueOnce(new Error("offline"));

    // 1) erro estruturado antigo, de um fonte comum
    const { result, rerender } = renderHook(({ src }) => useRpic(src, opts), {
      initialProps: { src: "box (" },
    });
    await waitFor(() => expect(result.current.errorDiag).not.toBeNull(), slow);

    // 2) fonte spice com o prelude falhando: mensagem do prelude SEM o diag velho
    rerender({ src: RLC_FIGURE });
    await waitFor(() => expect(result.current.error).toMatch(/dune prelude/), slow);
    expect(result.current.errorDiag).toBeNull();
    // ...e o fallback (compile puro) mostra o erro REAL do rpic: `vsource` na linha 5
    await waitFor(() => expect(result.current.errorDiag?.line).toBe(5), slow);
    expect(load).toHaveBeenCalledTimes(1);

    // 3) a próxima edição tenta de novo — agora carrega e compila com o prelude
    load.mockImplementation(async () => {
      have = prelude;
      return prelude;
    });
    rerender({ src: RLC_FIGURE.replace(".PE", "# edit\n.PE") });
    await waitFor(() => expect(result.current.error).toBeNull(), slow);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.svg).toMatch(/<g id="s0"/);
    expect(result.current.objects.some((o) => o.line === 5 && !o.file)).toBe(true);
  });

  it("fonte spice que compila sem o prelude: falha na carga não deixa erro", async () => {
    loaded.mockReturnValue(null);
    load.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRpic(".PS\nspice = 1\nbox\n.PE\n", opts));
    await waitFor(() => expect(result.current.version).toBeGreaterThan(0), slow);
    expect(result.current.error).toBeNull();
    expect(result.current.svg).toContain("<svg");
  });
});
