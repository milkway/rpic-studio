import { loadDraft, saveDraft, loadSettings, saveSettings } from "@/lib/storage";

describe("persistência local (draft e settings)", () => {
  beforeEach(() => window.localStorage.clear());

  it("faz roundtrip do rascunho", () => {
    saveDraft('box "a"', true);
    const draft = loadDraft();
    expect(draft?.source).toBe('box "a"');
    expect(draft?.circuits).toBe(true);
    expect(draft?.savedAt).toBeTruthy();
  });

  it("retorna null sem rascunho salvo", () => {
    expect(loadDraft()).toBeNull();
  });

  it("sobrevive a JSON corrompido", () => {
    window.localStorage.setItem("rpic:draft.v1", "{corrompido");
    expect(loadDraft()).toBeNull();
  });

  it("settings têm default e persistem", () => {
    expect(loadSettings().layout).toBe("horizontal");
    saveSettings({ layout: "vertical" });
    expect(loadSettings().layout).toBe("vertical");
  });
});
