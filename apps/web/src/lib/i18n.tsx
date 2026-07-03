// i18n leve e tipado: inglês (padrão) e português. Sem lib externa — um
// contexto + dicionários com paridade de chaves garantida pelo TypeScript.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PREFS_EVENT, pushPrefsSoon } from "./prefs";

export type Locale = "en" | "pt";

const LOCALE_KEY = "rpic:locale.v1";

const en = {
  // navegação
  "nav.examples": "Examples",
  "nav.help": "Help",
  "nav.home": "rpic studio — home",

  // usuário
  "user.signIn": "Sign in",
  "user.myDiagrams": "My diagrams",
  "user.signOut": "Sign out",
  "user.account": "Account",

  // toolbar do editor
  "toolbar.save": "Save",
  "toolbar.saveTip": "Save (⌘S)",
  "toolbar.export": "Export",
  "toolbar.exportTip": "Export and copy",
  "toolbar.download": "Download",
  "toolbar.sourcePic": "Source (.pic)",
  "toolbar.vectorSvg": "Vector (.svg)",
  "toolbar.imagePng": "Image (.png, 2x)",
  "toolbar.copySection": "Copy",
  "toolbar.copyImage": "Image to clipboard",
  "toolbar.layoutStack": "Stack panels",
  "toolbar.layoutSideBySide": "Panels side by side",
  "toolbar.layoutAria": "Toggle layout",

  // compartilhar
  "share.button": "Share",
  "share.title": "Share diagram",
  "share.desc": "Anyone opening the link sees the diagram and its code.",
  "share.embedHeader": "Link with the code embedded",
  "share.embedNote":
    "The code travels compressed inside the link itself — nothing is sent to any server.",
  "share.tooLong":
    "Large diagram: this link may not fit in some messaging apps — prefer the short link below.",
  "share.shortHeader": "Short link",
  "share.copy": "Copy",
  "share.copied": "Copied",
  "share.linkCopied": "Link copied",
  "share.revoke": "Revoke short link",
  "share.revoked": "Short link revoked",
  "share.generate": "Create public short link",
  "share.saveFirst": "Save the diagram to your account to create a short link.",
  "share.signInFirst": "Sign in and save the diagram to create a short link.",
  "share.comingWithLogin": "Coming along with sign-in — for now, use the link above.",
  "share.genError": "Could not create the link",

  // salvar
  "save.title": "Save diagram",
  "save.desc": "The diagram is stored in your account and can get a public short link.",
  "save.placeholder": "Diagram name",
  "save.cancel": "Cancel",
  "save.save": "Save",
  "save.saving": "Saving…",
  "save.saved": "Diagram saved",
  "save.error": "Could not save",
  "save.untitled": "Untitled",

  // preview
  "preview.tabImage": "Image",
  "preview.copy": "Copy",
  "preview.copiedToClipboard": "Copied to clipboard",
  "preview.replayTip": "Replay animation (⌘⏎)",
  "preview.replayAria": "Replay animation",
  "preview.zoomOut": "Zoom out",
  "preview.zoomIn": "Zoom in",
  "preview.zoomReset": "Reset to 100%",
  "preview.fit": "Fit to screen",
  "preview.loading": "loading the rpic engine…",
  "preview.fixing": "fixing… the last valid diagram is still here",
  "preview.compiled": "compiled",
  "preview.compileError": "compile error",
  "preview.animations": "animations",

  // editor
  "editor.draft": "draft",
  "editor.examples": "Examples",
  "editor.loadExample": "Load example",
  "editor.circuits": "circuits",
  "editor.circuitsTip": "Enables resistor(), lamp(), and_gate()…",
  "editor.clear": "Clear editor",
  "editor.notFound": "Diagram not found",

  // toasts genéricos
  "toast.imageCopied": "Image copied",
  "toast.svgCopiedText": "SVG copied as text",
  "toast.copyError": "Could not copy",
  "toast.pngError": "Could not generate the PNG",

  // meus diagramas
  "diagrams.title": "My diagrams",
  "diagrams.subtitle": "Stored in your account — open, rename or create a public link.",
  "diagrams.new": "New",
  "diagrams.signInCta": "Sign in with your Google account to save and organize diagrams.",
  "diagrams.signInButton": "Sign in with Google",
  "diagrams.loginUnavailable":
    "Sign-in is not available yet — meanwhile, your draft is saved in this browser and you can share any diagram by link.",
  "diagrams.loading": "loading…",
  "diagrams.empty": "No diagrams saved yet — go back to the editor and hit “Save”.",
  "diagrams.public": "public",
  "diagrams.copyPublic": "Copy public link",
  "diagrams.publicCopied": "Public link copied",
  "diagrams.open": "Open in editor",
  "diagrams.rename": "Rename",
  "diagrams.renameTitle": "Rename diagram",
  "diagrams.renameError": "Could not rename",
  "diagrams.revokeLink": "Revoke public link",
  "diagrams.revoked": "Public link revoked",
  "diagrams.makePublic": "Create public link",
  "diagrams.created": "Public link created",
  "diagrams.delete": "Delete",
  "diagrams.deleteTitle": "Delete diagram?",
  "diagrams.deleteDesc": "“{title}” will be deleted forever, along with its public link.",
  "diagrams.deleted": "Diagram deleted",
  "diagrams.actionsFor": "Actions for {title}",
  "diagrams.circuitsTag": "circuits",

  // página pública
  "shared.readonly": "shared diagram · read-only",
  "shared.openInEditor": "Open in editor",
  "shared.notFound": "Diagram not found",
  "shared.notFoundDesc": "The link may have been revoked by its author.",
  "shared.loading": "loading…",

  // galeria de exemplos
  "examplesPage.title": "Examples",
  "examplesPage.subtitle":
    "From Kernighan's classic pipeline to full circuits — click any card to open it in the editor and build from there.",
  "examplesPage.open": "Open in editor",

  // papel do diagrama
  "canvas.button": "Diagram paper",
  "canvas.pattern": "Pattern",
  "canvas.plain": "Plain",
  "canvas.dots": "Dots",
  "canvas.lines": "Lines",
  "canvas.bg": "Background",
  "canvas.gridColor": "Grid color",
  "canvas.gridSize": "Grid size",
  "canvas.custom": "Custom color",
  "canvas.reset": "Reset to default",

  // idioma
  "locale.label": "Language",
  "locale.en": "English",
  "locale.pt": "Português",
} as const;

export type MessageKey = keyof typeof en;

const pt: Record<MessageKey, string> = {
  "nav.examples": "Exemplos",
  "nav.help": "Ajuda",
  "nav.home": "rpic studio — início",

  "user.signIn": "Entrar",
  "user.myDiagrams": "Meus diagramas",
  "user.signOut": "Sair",
  "user.account": "Conta",

  "toolbar.save": "Salvar",
  "toolbar.saveTip": "Salvar (⌘S)",
  "toolbar.export": "Exportar",
  "toolbar.exportTip": "Exportar e copiar",
  "toolbar.download": "Baixar",
  "toolbar.sourcePic": "Código (.pic)",
  "toolbar.vectorSvg": "Vetor (.svg)",
  "toolbar.imagePng": "Imagem (.png, 2x)",
  "toolbar.copySection": "Copiar",
  "toolbar.copyImage": "Imagem para a área de transferência",
  "toolbar.layoutStack": "Empilhar painéis",
  "toolbar.layoutSideBySide": "Painéis lado a lado",
  "toolbar.layoutAria": "Alternar layout",

  "share.button": "Compartilhar",
  "share.title": "Compartilhar diagrama",
  "share.desc": "Quem abrir o link vê o diagrama e o código.",
  "share.embedHeader": "Link com o código embutido",
  "share.embedNote":
    "O código viaja comprimido dentro do próprio link — nada é enviado a servidor algum.",
  "share.tooLong":
    "Diagrama grande: este link pode não caber em alguns aplicativos — prefira o link curto abaixo.",
  "share.shortHeader": "Link curto",
  "share.copy": "Copiar",
  "share.copied": "Copiado",
  "share.linkCopied": "Link copiado",
  "share.revoke": "Revogar link curto",
  "share.revoked": "Link curto revogado",
  "share.generate": "Gerar link curto público",
  "share.saveFirst": "Salve o diagrama na sua conta para gerar um link curto.",
  "share.signInFirst": "Entre com sua conta e salve o diagrama para gerar um link curto.",
  "share.comingWithLogin": "Chega junto com o login — por enquanto, use o link acima.",
  "share.genError": "Não foi possível gerar o link",

  "save.title": "Salvar diagrama",
  "save.desc": "O diagrama fica na sua conta e pode ganhar um link curto público.",
  "save.placeholder": "Nome do diagrama",
  "save.cancel": "Cancelar",
  "save.save": "Salvar",
  "save.saving": "Salvando…",
  "save.saved": "Diagrama salvo",
  "save.error": "Não foi possível salvar",
  "save.untitled": "Sem título",

  "preview.tabImage": "Imagem",
  "preview.copy": "Copiar",
  "preview.copiedToClipboard": "Copiado para a área de transferência",
  "preview.replayTip": "Repetir animação (⌘⏎)",
  "preview.replayAria": "Repetir animação",
  "preview.zoomOut": "Diminuir zoom",
  "preview.zoomIn": "Aumentar zoom",
  "preview.zoomReset": "Restaurar 100%",
  "preview.fit": "Ajustar à tela",
  "preview.loading": "carregando o motor rpic…",
  "preview.fixing": "corrigindo… o último diagrama válido continua aí",
  "preview.compiled": "compilado",
  "preview.compileError": "erro de compilação",
  "preview.animations": "animações",

  "editor.draft": "rascunho",
  "editor.examples": "Exemplos",
  "editor.loadExample": "Carregar exemplo",
  "editor.circuits": "circuitos",
  "editor.circuitsTip": "Habilita resistor(), lamp(), and_gate()…",
  "editor.clear": "Limpar editor",
  "editor.notFound": "Diagrama não encontrado",

  "toast.imageCopied": "Imagem copiada",
  "toast.svgCopiedText": "SVG copiado como texto",
  "toast.copyError": "Não foi possível copiar",
  "toast.pngError": "Não foi possível gerar o PNG",

  "diagrams.title": "Meus diagramas",
  "diagrams.subtitle": "Salvos na sua conta — abra, renomeie ou gere um link público.",
  "diagrams.new": "Novo",
  "diagrams.signInCta": "Entre com sua conta Google para salvar e organizar diagramas.",
  "diagrams.signInButton": "Entrar com Google",
  "diagrams.loginUnavailable":
    "O login ainda não está disponível — enquanto isso, seu rascunho fica salvo neste navegador e você pode compartilhar qualquer diagrama por link.",
  "diagrams.loading": "carregando…",
  "diagrams.empty": "Nenhum diagrama salvo ainda — volte ao editor e use “Salvar”.",
  "diagrams.public": "público",
  "diagrams.copyPublic": "Copiar link público",
  "diagrams.publicCopied": "Link público copiado",
  "diagrams.open": "Abrir no editor",
  "diagrams.rename": "Renomear",
  "diagrams.renameTitle": "Renomear diagrama",
  "diagrams.renameError": "Não foi possível renomear",
  "diagrams.revokeLink": "Revogar link público",
  "diagrams.revoked": "Link público revogado",
  "diagrams.makePublic": "Gerar link público",
  "diagrams.created": "Link público criado",
  "diagrams.delete": "Excluir",
  "diagrams.deleteTitle": "Excluir diagrama?",
  "diagrams.deleteDesc": "“{title}” será excluído para sempre, junto com o link público.",
  "diagrams.deleted": "Diagrama excluído",
  "diagrams.actionsFor": "Ações de {title}",
  "diagrams.circuitsTag": "circuitos",

  "shared.readonly": "diagrama compartilhado · somente leitura",
  "shared.openInEditor": "Abrir no editor",
  "shared.notFound": "Diagrama não encontrado",
  "shared.notFoundDesc": "O link pode ter sido revogado pelo autor.",
  "shared.loading": "carregando…",

  "examplesPage.title": "Exemplos",
  "examplesPage.subtitle":
    "Do pipeline clássico do Kernighan a circuitos completos — clique para abrir qualquer um no editor e partir dele.",
  "examplesPage.open": "Abrir no editor",

  "canvas.button": "Papel do diagrama",
  "canvas.pattern": "Padrão",
  "canvas.plain": "Liso",
  "canvas.dots": "Pontos",
  "canvas.lines": "Linhas",
  "canvas.bg": "Fundo",
  "canvas.gridColor": "Cor da grade",
  "canvas.gridSize": "Tamanho da grade",
  "canvas.custom": "Cor personalizada",
  "canvas.reset": "Restaurar padrão",

  "locale.label": "Idioma",
  "locale.en": "English",
  "locale.pt": "Português",
};

const messages: Record<Locale, Record<MessageKey, string>> = { en, pt };

function loadLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "pt") return stored;
  } catch {
    // storage bloqueado — segue o default
  }
  return "en"; // default: inglês
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => en[key],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(loadLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en";
  }, [locale]);

  // Prefs da conta aplicadas ao storage → relê o idioma.
  useEffect(() => {
    const onPrefs = () => setLocaleState(loadLocale());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // sem persistência — a escolha vale para a sessão
    }
    pushPrefsSoon();
  };

  const t = (key: MessageKey, params?: Record<string, string>) => {
    let text: string = messages[locale][key];
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, value);
      }
    }
    return text;
  };

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Data/hora no formato do idioma corrente. */
export function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
