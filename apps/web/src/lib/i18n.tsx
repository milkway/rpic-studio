// i18n leve e tipado: inglês (padrão) e português. Sem lib externa — um
// contexto + dicionários com paridade de chaves garantida pelo TypeScript.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PREFS_EVENT, pushPrefsSoon } from "./prefs";

export type Locale = "en" | "pt";

const LOCALE_KEY = "rpic:locale.v1";

const en = {
  // navegação
  "nav.editor": "Editor",
  "nav.examples": "Examples",
  "nav.bindings": "Bindings",
  "nav.help": "Help",
  "nav.users": "Users",
  "nav.home": "rpic studio — home",

  // rodapé
  "footer.engine": "engine",
  "footer.changelog": "What's new",

  // usuários (admin)
  "users.title": "Users",
  "users.subtitle": "Everyone who has signed in to this app.",
  "users.signInRequired": "Sign in to view this page.",
  "users.forbidden": "You don't have permission to view this page.",
  "users.loadError": "Could not load the user list.",
  "users.total": "Total users",
  "users.activeSessions": "Active sessions",
  "users.empty": "No users yet.",
  "users.col.email": "Email",
  "users.col.name": "Name",
  "users.col.createdAt": "Created",
  "users.col.lastLogin": "Last login",

  // paleta de circuitos
  "circuitPalette.tip": "Insert a circuit element",
  "circuitPalette.button": "Circuits",
  "circuitPalette.title": "Insert element",
  "circuitPalette.group.passive": "Passive",
  "circuitPalette.group.source": "Sources",
  "circuitPalette.group.semiconductor": "Semiconductors",
  "circuitPalette.group.logic": "Logic & ICs",
  "circuitPalette.group.measure": "Meters & annotations",
  "circuitPalette.group.electromech": "Electromechanical & transducers",
  "circuitPalette.group.connector": "Connectors & switches",

  // CSS custom
  "css.title": "Diagram CSS",
  "css.hint": "Style elements tagged with `class \"…\"`. Saved with the diagram; applies in the preview and .svg exports.",

  // bindings
  "bindings.title": "Bindings",
  "bindings.subtitle":
    "The same rpic engine everywhere — from the command line, R, Python or JavaScript. Install, render to SVG/PNG/PDF, and reuse the diagrams you draw here.",
  "bindings.install": "Install",
  "bindings.usage": "Usage",
  "bindings.docs": "Official docs",
  "bindings.cli.what":
    "The `rpic` binary compiles a .pic file to SVG (default), PNG or PDF. Great for scripts, Makefiles and CI.",
  "bindings.py.what":
    "PyPI package `rpiclang` (imported as `rpic`). Renders to SVG/PNG/PDF and returns the structured compile bundle.",
  "bindings.r.what":
    "R package via extendr — same engine, ideal for RMarkdown/Quarto reports and reproducible figures.",
  "bindings.js.what":
    "The WebAssembly engine (browser + Node) that powers this studio. Compile to SVG, play GSAP animations, opt into the TeX math build.",
  "bindings.rest.what":
    "This studio's hosted endpoint: POST pic source, get SVG, PNG or PDF back — high-fidelity raster and PDF (with real TeX) that the browser can't produce. No install, rate-limited.",
  "bindings.note.circuits":
    "Every binding takes a circuits flag (or write copy \"circuits\" in the source) to load the electrical-element library.",
  "bindings.note.tex":
    "TeX $…$ labels typeset with the math-enabled build (CLI/R/Python by default; JS via the opt-in math wasm).",
  "bindings.note.fonts":
    "The REST render takes a google_font (from the studio's curated catalog) and matches it in the PNG/PDF, with true weight fidelity — bold and italic use the real glyphs, not synthesized ones.",

  // editor visual
  "toolbar.modeCode": "Code",
  "toolbar.modeVisual": "Visual",
  "toolbar.modeTip": "Switch between the code editor and the visual builder",
  "visual.inspector.font": "Font",
  "visual.inspector.fontDefault": "Default font",
  "visual.inspector.affectsAll": "Macro/loop: the style goes into the block — applies to ALL instances.",
  "visual.inspector.rotate": "Rotate",
  "visual.inspector.align": "Align",
  "visual.inspector.fill": "Fill",
  "visual.inspector.stroke": "Outline",
  "visual.inspector.hatch": "Hatch",
  "visual.inspector.hatchAngle": "Hatch angle",
  "visual.inspector.hatchSep": "Hatch spacing",
  "visual.inspector.hatchWid": "Hatch width",
  "visual.inspector.hatchColor": "Hatch color",
  "visual.inspector.gradient": "Gradient",
  "visual.inspector.gradientFrom": "Gradient from",
  "visual.inspector.gradientTo": "Gradient to",
  "visual.inspector.gradientAngle": "Gradient angle",
  "visual.inspector.opacity": "Opacity",
  "visual.inspector.size": "Size (in)",
  "visual.inspector.width": "Width (inches)",
  "visual.inspector.height": "Height (inches)",
  "visual.inspector.radius": "Radius (inches)",
  "visual.inspector.corner": "Corner radius (inches)",
  "visual.inspector.link": "Link (URL)",
  "visual.objectsHint": "Double-click → jump to code",
  "visual.objectsLine": "line {line}",
  "visual.objectsClose": "Close (deselect · Esc)",
  "visual.objectsMin": "Minimize panel",
  "visual.objectsExpand": "Expand panel",
  "visual.inspector.line": "Line",
  "visual.inspector.thick": "Weight",
  "visual.none": "none",

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
  "toolbar.filePdf": "Document (.pdf)",
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
  "preview.preludeLoadFailed": "Failed to load the dune prelude (needed by spice = 1 figures): {error}",
  "preview.fixing": "fixing… the last valid diagram is still here",
  "preview.compiled": "compiled",
  "preview.compileError": "compile error",
  "preview.animations": "animations",
  "preview.scrub": "Scrub the timeline (animate scroll)",
  "preview.coordsTip": "pic coordinates under the cursor — click to copy",
  "preview.coordsCopied": "Coordinates copied",

  // painel Simular (dune)
  "sim.tab": "Simulate",
  "sim.tabShort": "SIM",
  "sim.run": "Run",
  "sim.rerun": "Run again",
  "sim.cancel": "Cancel",
  "sim.running": "simulating… {s}",
  "sim.ranIn": "ran in {ms}",
  "sim.cancelled": "cancelled",
  "sim.stale": "code changed since this run",
  "sim.notMarked": "Add {code} to the figure to simulate it with dune: elements become a SPICE netlist, analyses come from {dot} lines.",
  "sim.idle": "Run the simulation to see waveforms, the extracted netlist and diagnostics.",
  "sim.loadError": "Could not load the simulator.",
  "sim.engineError": "Simulation failed ({kind})",
  "sim.picError": "The figure could not be turned into a netlist",
  "sim.diagnostics": "Diagnostics",
  "sim.netlist": "Netlist",
  "sim.copyNetlist": "Copy netlist",
  "sim.plot": "Plot",
  "sim.more": "(+{n} more)",
  "sim.figure": "Figure",
  "sim.figureError": "Could not draw the simulated figure: {msg}",
  "sim.variable": "Variable",
  "sim.value": "Value",
  "sim.noPlots": "The deck has no analysis (add e.g. {code}).",
  "sim.chartLabel": "{plot}: {n} traces versus {scale}",
  "sim.probeHint": "Click or tap a wire or dot to plot (or hide) its voltage",
  "sim.probeFull": "At most {n} traces — hide one first",
  "sim.probeNet": "Probe {trace}",
  "sim.reranIn": "re-ran in {ms}",
  "sim.adjust": "Adjust {refdes}",
  "sim.closeSlider": "Close the slider",
  "sim.sliderValue": "Value of {refdes}",
  "sim.sliderKeys": "←/→ step · PgUp/PgDn decade · Home reset",
  "sim.resetTo": "Reset {value}",
  "sim.sliderHint": "click a component to adjust its value",
  "sim.altered": "{n} altered",
  "sim.alteredTitle": "Altered values",
  "sim.resetAll": "Reset all",
  "sim.resetOne": "Reset {refdes}",
  "sim.writtenBack": "{refdes} = {value} written to the code",
  "sim.notWritten": "{refdes}: changed in the simulation only — {reason}",
  "sim.wb.noCall": "no labelled call {refdes}: …(…) in the code",
  "sim.wb.unknownMacro": "{macro}() has no known value argument",
  "sim.wb.notLiteral": "its value in the code is not a plain number",
  "sim.wb.stale": "the code changed since this run",
  "sim.wb.unavailable": "code positions aren't ready yet — wait for the preview to compile (or fix its error) and release again",
  "sim.time": "Time cursor",
  "sim.play": "Play the time cursor",
  "sim.pause": "Pause",
  "sim.clearCursor": "Hide the time cursor",

  // editor
  "editor.draft": "draft",
  "editor.examples": "Examples",
  "editor.loadExample": "Load example",
  "editor.circuits": "circuits",
  "editor.circuitsTip": "Enables resistor(), lamp(), and_gate()…",
  "editor.circuitsAuto": "Turned on automatically — the code calls circuit-library macros",
  "editor.clear": "Clear editor",
  "editor.copyCode": "Copy pic code",
  "editor.notFound": "Diagram not found",

  // toasts genéricos
  "toast.imageCopied": "Image copied",
  "toast.svgCopiedText": "SVG copied as text",
  "toast.copyError": "Could not copy",
  "toast.pngError": "Could not generate the PNG",
  "toast.pdfError": "Could not generate the PDF (the render service is unavailable)",

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
  "diagrams.private": "private",
  "diagrams.privacyNote":
    "Only you can see your diagrams. Sharing creates a public, read-only link — revoke it anytime to make it private again.",
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
    "From Kernighan's classic pipeline to health-care flows adapted from pikup — copy the code, share a link or open any of them in the editor.",
  "examplesPage.open": "Open in editor",
  "examplesPage.copyCode": "Copy code",
  "examplesPage.copyLink": "Copy link",
  "examplesPage.codeCopied": "Code copied",
  "examplesPage.all": "All",
  "examplesPage.expand": "Show all the code",
  "examplesPage.collapse": "Collapse the code",

  // diagnósticos
  "diag.line": "line {n}",

  // math
  "math.reloadHint": "Math $…$ detected — reload the page to typeset it",
  "math.loadingMath": "Math $…$ detected — enabling typesetting…",

  // papel do preview (grade/fundo — não sai no export)
  "canvas.button": "Diagram paper",
  "canvas.paper": "Paper",
  "canvas.pattern": "Pattern",
  "canvas.plain": "Plain",
  "canvas.dots": "Dots",
  "canvas.lines": "Lines",
  "canvas.bg": "Background",
  "canvas.gridColor": "Grid color",
  "canvas.gridSize": "Grid size",
  "canvas.custom": "Custom color",
  "canvas.typeface": "Typeface",
  "canvas.searchFonts": "Search Google Fonts…",
  "canvas.reset": "Reset to default",

  // padrões do diagrama (variáveis pic)
  "defaults.button": "Defaults",
  "defaults.tip": "Diagram defaults (scale, sizes, thickness…)",
  "defaults.title": "Diagram defaults",
  "defaults.desc":
    "These are pic variables — they change the geometry, so they're written into your code as an editable, shareable block.",
  "defaults.global": "Global",
  "defaults.dims": "Sizes",
  "defaults.stroke": "Stroke & fill",
  "defaults.arrows": "Arrowheads",
  "defaults.apply": "Insert into code",
  "defaults.clear": "Restore defaults",
  "defaults.var.scale": "Scale (whole drawing)",
  "defaults.var.boxwid": "Box width",
  "defaults.var.boxht": "Box height",
  "defaults.var.circlerad": "Circle radius",
  "defaults.var.ellipsewid": "Ellipse width",
  "defaults.var.ellipseht": "Ellipse height",
  "defaults.var.arcrad": "Arc radius",
  "defaults.var.linewid": "Line length",
  "defaults.var.linethick": "Line thickness",
  "defaults.var.fillval": "Default fill (0–1)",
  "defaults.var.arrowwid": "Arrowhead width",
  "defaults.var.arrowht": "Arrowhead length",

  // recursos auto-detectados
  "features.title": "Detected features",
  "features.circuits": "Circuit library",
  "features.texlabels": "TeX formulas ($…$)",
  "features.on": "on",
  "features.off": "off",
  "features.texReload": "Reload the page to typeset the formulas.",

  // painel de mapa (geopic)
  "map.tab": "Map",
  "map.tabShort": "MAP",
  "map.frame": "frame",
  "map.frameSource": "as in source",
  "map.labels": "labels",
  "map.labelsTip": "Size of the drawing's labels on the map (1× = true to the ground)",
  "map.download": "GeoJSON",
  "map.downloadTip": "Download the drawing as GeoJSON (drawing.geojson)",
  "map.loading": "loading the map engine…",
  "map.loadFailed": "Could not load the map: {msg}",
  "map.features": "{n} features",
  "map.stale": "showing the last valid drawing",
  "map.method.anchor": "anchor",
  "map.method.two_points": "two control points",
  "map.method.helmert": "Helmert fit",

  // idioma
  "locale.label": "Language",
  "locale.en": "English",
  "locale.pt": "Português",
} as const;

export type MessageKey = keyof typeof en;

const pt: Record<MessageKey, string> = {
  "nav.editor": "Editor",
  "nav.examples": "Exemplos",
  "nav.bindings": "Bindings",
  "nav.help": "Ajuda",
  "nav.users": "Usuários",
  "nav.home": "rpic studio — início",

  // rodapé
  "footer.engine": "motor",
  "footer.changelog": "Novidades",

  // usuários (admin)
  "users.title": "Usuários",
  "users.subtitle": "Todos que já fizeram login neste app.",
  "users.signInRequired": "Entre com sua conta para ver esta página.",
  "users.forbidden": "Você não tem permissão para ver esta página.",
  "users.loadError": "Não foi possível carregar a lista de usuários.",
  "users.total": "Total de usuários",
  "users.activeSessions": "Sessões ativas",
  "users.empty": "Nenhum usuário ainda.",
  "users.col.email": "E-mail",
  "users.col.name": "Nome",
  "users.col.createdAt": "Criado em",
  "users.col.lastLogin": "Último login",

  // paleta de circuitos
  "circuitPalette.tip": "Inserir um elemento de circuito",
  "circuitPalette.button": "Circuitos",
  "circuitPalette.title": "Inserir elemento",
  "circuitPalette.group.passive": "Passivos",
  "circuitPalette.group.source": "Fontes",
  "circuitPalette.group.semiconductor": "Semicondutores",
  "circuitPalette.group.logic": "Lógica e CIs",
  "circuitPalette.group.measure": "Medidores e anotações",
  "circuitPalette.group.electromech": "Eletromecânicos e transdutores",
  "circuitPalette.group.connector": "Conectores e chaves",

  // CSS custom
  "css.title": "CSS do diagrama",
  "css.hint": "Estilize os elementos marcados com `class \"…\"`. Guardado no diagrama; vale no preview e nos exports .svg.",

  "bindings.title": "Bindings",
  "bindings.subtitle":
    "O mesmo motor rpic em todo lugar — linha de comando, R, Python ou JavaScript. Instale, renderize para SVG/PNG/PDF e reaproveite os diagramas que você desenha aqui.",
  "bindings.install": "Instalar",
  "bindings.usage": "Uso",
  "bindings.docs": "Documentação oficial",
  "bindings.cli.what":
    "O binário `rpic` compila um arquivo .pic para SVG (padrão), PNG ou PDF. Ótimo para scripts, Makefiles e CI.",
  "bindings.py.what":
    "Pacote PyPI `rpiclang` (importado como `rpic`). Renderiza SVG/PNG/PDF e devolve o bundle estruturado da compilação.",
  "bindings.r.what":
    "Pacote R via extendr — o mesmo motor, ideal para relatórios RMarkdown/Quarto e figuras reprodutíveis.",
  "bindings.js.what":
    "O motor WebAssembly (browser + Node) que roda este studio. Compila para SVG, toca animações GSAP, com o build de math TeX opcional.",
  "bindings.rest.what":
    "O endpoint hospedado deste studio: envie o código pic por POST e receba SVG, PNG ou PDF — raster e PDF de alta fidelidade (com TeX de verdade) que o browser não produz. Sem instalar, rate-limited.",
  "bindings.note.circuits":
    "Todo binding aceita um flag de circuitos (ou escreva copy \"circuits\" no código) para carregar a biblioteca de elementos elétricos.",
  "bindings.note.tex":
    "Rótulos TeX $…$ são tipografados com o build de math (CLI/R/Python por padrão; JS via o wasm de math opcional).",
  "bindings.note.fonts":
    "O render REST aceita um google_font (do catálogo curado do studio) e casa a fonte no PNG/PDF, com fidelidade de peso — negrito e itálico usam o glifo real, não sintetizado.",

  // editor visual
  "toolbar.modeCode": "Código",
  "toolbar.modeVisual": "Visual",
  "toolbar.modeTip": "Alternar entre o editor de código e o construtor visual",
  "visual.inspector.font": "Fonte",
  "visual.inspector.fontDefault": "Fonte padrão",
  "visual.inspector.affectsAll": "Macro/laço: o estilo entra no bloco — aplica a TODAS as instâncias.",
  "visual.inspector.rotate": "Girar",
  "visual.inspector.align": "Alinhamento",
  "visual.inspector.fill": "Preenchimento",
  "visual.inspector.stroke": "Contorno",
  "visual.inspector.hatch": "Hachura",
  "visual.inspector.hatchAngle": "Ângulo da hachura",
  "visual.inspector.hatchSep": "Espaço da hachura",
  "visual.inspector.hatchWid": "Largura da hachura",
  "visual.inspector.hatchColor": "Cor da hachura",
  "visual.inspector.gradient": "Gradiente",
  "visual.inspector.gradientFrom": "Gradiente de",
  "visual.inspector.gradientTo": "Gradiente até",
  "visual.inspector.gradientAngle": "Ângulo do gradiente",
  "visual.inspector.opacity": "Opacidade",
  "visual.inspector.size": "Dimensões (pol)",
  "visual.inspector.width": "Largura (polegadas)",
  "visual.inspector.height": "Altura (polegadas)",
  "visual.inspector.radius": "Raio (polegadas)",
  "visual.inspector.corner": "Raio dos cantos (polegadas)",
  "visual.inspector.link": "Link (URL)",
  "visual.objectsHint": "Duplo-clique → ir ao código",
  "visual.objectsLine": "linha {line}",
  "visual.objectsClose": "Fechar (desselecionar · Esc)",
  "visual.objectsMin": "Minimizar painel",
  "visual.objectsExpand": "Expandir painel",
  "visual.inspector.line": "Traço",
  "visual.inspector.thick": "Espessura",
  "visual.none": "nenhum",

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
  "toolbar.filePdf": "Documento (.pdf)",
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
  "preview.preludeLoadFailed": "Falha ao carregar o prelúdio do dune (necessário às figuras spice = 1): {error}",
  "preview.fixing": "corrigindo… o último diagrama válido continua aí",
  "preview.compiled": "compilado",
  "preview.compileError": "erro de compilação",
  "preview.animations": "animações",
  "preview.scrub": "Arrastar a timeline (animate scroll)",
  "preview.coordsTip": "coordenadas pic sob o cursor — clique para copiar",
  "preview.coordsCopied": "Coordenadas copiadas",

  // painel Simular (dune)
  "sim.tab": "Simular",
  "sim.tabShort": "SIM",
  "sim.run": "Simular",
  "sim.rerun": "Simular de novo",
  "sim.cancel": "Cancelar",
  "sim.running": "simulando… {s}",
  "sim.ranIn": "rodou em {ms}",
  "sim.cancelled": "cancelada",
  "sim.stale": "o código mudou desde esta execução",
  "sim.notMarked": "Adicione {code} à figura para simulá-la com o dune: os elementos viram um netlist SPICE e as análises vêm das linhas {dot}.",
  "sim.idle": "Rode a simulação para ver as formas de onda, o netlist extraído e os diagnósticos.",
  "sim.loadError": "Não foi possível carregar o simulador.",
  "sim.engineError": "A simulação falhou ({kind})",
  "sim.picError": "Não deu para transformar a figura em netlist",
  "sim.diagnostics": "Diagnósticos",
  "sim.netlist": "Netlist",
  "sim.copyNetlist": "Copiar netlist",
  "sim.plot": "Gráfico",
  "sim.more": "(+{n} outros)",
  "sim.figure": "Figura",
  "sim.figureError": "Não deu para desenhar a figura simulada: {msg}",
  "sim.variable": "Variável",
  "sim.value": "Valor",
  "sim.noPlots": "O deck não tem análise (adicione p.ex. {code}).",
  "sim.chartLabel": "{plot}: {n} traços em função de {scale}",
  "sim.probeHint": "Clique ou toque num fio ou ponto para plotar (ou esconder) a tensão dele",
  "sim.probeFull": "No máximo {n} traços — esconda um antes",
  "sim.probeNet": "Sondar {trace}",
  "sim.reranIn": "re-rodou em {ms}",
  "sim.adjust": "Ajustar {refdes}",
  "sim.closeSlider": "Fechar o slider",
  "sim.sliderValue": "Valor de {refdes}",
  "sim.sliderKeys": "←/→ passo · PgUp/PgDn década · Home volta",
  "sim.resetTo": "Voltar a {value}",
  "sim.sliderHint": "clique num componente para ajustar o valor",
  "sim.altered": "{n} alterado(s)",
  "sim.alteredTitle": "Valores alterados",
  "sim.resetAll": "Desfazer tudo",
  "sim.resetOne": "Desfazer {refdes}",
  "sim.writtenBack": "{refdes} = {value} escrito no código",
  "sim.notWritten": "{refdes}: alterado só na simulação — {reason}",
  "sim.wb.noCall": "não há chamada rotulada {refdes}: …(…) no código",
  "sim.wb.unknownMacro": "{macro}() não tem argumento de valor conhecido",
  "sim.wb.notLiteral": "o valor no código não é um número simples",
  "sim.wb.stale": "o código mudou desde esta execução",
  "sim.wb.unavailable": "as posições no código ainda não estão prontas — espere o preview compilar (ou corrija o erro) e solte de novo",
  "sim.time": "Cursor de tempo",
  "sim.play": "Animar o cursor de tempo",
  "sim.pause": "Pausar",
  "sim.clearCursor": "Esconder o cursor de tempo",

  "editor.draft": "rascunho",
  "editor.examples": "Exemplos",
  "editor.loadExample": "Carregar exemplo",
  "editor.circuits": "circuitos",
  "editor.circuitsTip": "Habilita resistor(), lamp(), and_gate()…",
  "editor.circuitsAuto": "Ligado automaticamente — o código chama macros da biblioteca de circuitos",
  "editor.clear": "Limpar editor",
  "editor.copyCode": "Copiar código pic",
  "editor.notFound": "Diagrama não encontrado",

  "toast.imageCopied": "Imagem copiada",
  "toast.svgCopiedText": "SVG copiado como texto",
  "toast.copyError": "Não foi possível copiar",
  "toast.pngError": "Não foi possível gerar o PNG",
  "toast.pdfError": "Não foi possível gerar o PDF (o serviço de render está indisponível)",

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
  "diagrams.private": "privado",
  "diagrams.privacyNote":
    "Só você vê seus diagramas. Compartilhar cria um link público só de leitura — revogue quando quiser para voltar a privado.",
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
    "Do pipeline clássico do Kernighan aos fluxos de saúde adaptados do pikup — copie o código, compartilhe o link ou abra qualquer um no editor.",
  "examplesPage.open": "Abrir no editor",
  "examplesPage.copyCode": "Copiar código",
  "examplesPage.copyLink": "Copiar link",
  "examplesPage.codeCopied": "Código copiado",
  "examplesPage.all": "Todos",
  "examplesPage.expand": "Ver o código completo",
  "examplesPage.collapse": "Recolher o código",

  "diag.line": "linha {n}",

  "math.reloadHint": "Fórmulas $…$ detectadas — recarregue a página para tipografá-las",
  "math.loadingMath": "Fórmulas $…$ detectadas — ativando a tipografia…",

  "canvas.button": "Papel do diagrama",
  "canvas.paper": "Papel",
  "canvas.pattern": "Padrão",
  "canvas.plain": "Liso",
  "canvas.dots": "Pontos",
  "canvas.lines": "Linhas",
  "canvas.bg": "Fundo",
  "canvas.gridColor": "Cor da grade",
  "canvas.gridSize": "Tamanho da grade",
  "canvas.custom": "Cor personalizada",
  "canvas.typeface": "Fonte",
  "canvas.searchFonts": "Buscar Google Fonts…",
  "canvas.reset": "Restaurar padrão",

  "defaults.button": "Padrões",
  "defaults.tip": "Padrões do diagrama (escala, tamanhos, espessura…)",
  "defaults.title": "Padrões do diagrama",
  "defaults.desc":
    "São variáveis pic — mudam a geometria, então são escritas no seu código como um bloco editável e compartilhável.",
  "defaults.global": "Global",
  "defaults.dims": "Tamanhos",
  "defaults.stroke": "Traço e preenchimento",
  "defaults.arrows": "Pontas de seta",
  "defaults.apply": "Inserir no código",
  "defaults.clear": "Restaurar padrões",
  "defaults.var.scale": "Escala (desenho todo)",
  "defaults.var.boxwid": "Largura da caixa",
  "defaults.var.boxht": "Altura da caixa",
  "defaults.var.circlerad": "Raio do círculo",
  "defaults.var.ellipsewid": "Largura da elipse",
  "defaults.var.ellipseht": "Altura da elipse",
  "defaults.var.arcrad": "Raio do arco",
  "defaults.var.linewid": "Comprimento da linha",
  "defaults.var.linethick": "Espessura da linha",
  "defaults.var.fillval": "Preenchimento padrão (0–1)",
  "defaults.var.arrowwid": "Largura da ponta",
  "defaults.var.arrowht": "Comprimento da ponta",

  "features.title": "Recursos detectados",
  "features.circuits": "Biblioteca de circuitos",
  "features.texlabels": "Fórmulas TeX ($…$)",
  "features.on": "ativo",
  "features.off": "inativo",
  "features.texReload": "Recarregue a página para tipografar as fórmulas.",

  "map.tab": "Mapa",
  "map.tabShort": "MAPA",
  "map.frame": "frame",
  "map.frameSource": "como na fonte",
  "map.labels": "rótulos",
  "map.labelsTip": "Tamanho dos rótulos do desenho no mapa (1× = fiel ao chão)",
  "map.download": "GeoJSON",
  "map.downloadTip": "Baixar o desenho como GeoJSON (drawing.geojson)",
  "map.loading": "carregando o motor do mapa…",
  "map.loadFailed": "Não foi possível carregar o mapa: {msg}",
  "map.features": "{n} feições",
  "map.stale": "mostrando o último desenho válido",
  "map.method.anchor": "âncora",
  "map.method.two_points": "dois pontos de controle",
  "map.method.helmert": "ajuste de Helmert",

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
