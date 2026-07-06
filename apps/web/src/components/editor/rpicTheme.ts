// Temas do editor — porte fiel dos temas Shiki/VS Code oficiais do rpic
// (rpic/tools/highlight/themes/rpic-forest-{light,dark}.json), alternando
// com o modo claro/escuro do app, como os blocos de código do site rpic.dev.
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import { rpicTags } from "./rpicLanguage";

interface Chrome {
  text: string;
  muted: string;
  faint: string;
  caret: string;
  selection: string;
  activeLine: string;
  matchingBracket: string;
  raised: string;
  border: string;
  diagnosticBorder: string;
}

function chromeTheme(c: Chrome, dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: c.text,
        fontSize: "13.5px",
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.65",
        overflow: "auto",
      },
      ".cm-content": { caretColor: c.caret, padding: "14px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.caret, borderLeftWidth: "2px" },
      "&.cm-focused": { outline: "none" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection": {
        backgroundColor: c.selection,
      },
      ".cm-selectionBackground": { backgroundColor: c.selection },
      ".cm-activeLine": { backgroundColor: c.activeLine },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: c.faint,
        border: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: c.muted },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
      ".cm-matchingBracket": { backgroundColor: c.matchingBracket, outline: "none" },
      ".cm-lint-marker": { width: "0.9em" },
      ".cm-diagnostic": {
        fontFamily: "var(--font-sans)",
        borderLeft: `3px solid ${c.diagnosticBorder}`,
      },
      ".cm-tooltip": {
        backgroundColor: c.raised,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: "8px",
      },
      ".cm-panels": { backgroundColor: c.raised, color: c.text },
    },
    { dark },
  );
}

// ---- rpic-forest-dark (fundo #1e2823, dado pelo painel via --color-ink) ----
const darkChrome = chromeTheme(
  {
    text: "#d3e0d5",
    muted: "#6f8274",
    faint: "#556258",
    caret: "#81c784",
    selection: "rgba(129, 199, 132, 0.22)",
    activeLine: "rgba(255,255,255,0.035)",
    matchingBracket: "rgba(129, 199, 132, 0.25)",
    raised: "#273229",
    border: "#37453b",
    diagnosticBorder: "#e57373",
  },
  true,
);

const darkHighlight = HighlightStyle.define([
  { tag: t.lineComment, color: "#6f8274", fontStyle: "italic" },
  { tag: rpicTags.directive, color: "#81c784", fontWeight: "bold" },
  { tag: t.controlKeyword, color: "#81c784", fontWeight: "bold" },
  { tag: rpicTags.primitive, color: "#a5d6a7", fontWeight: "bold" },
  { tag: rpicTags.extension, color: "#4db6ac", fontWeight: "bold", fontStyle: "italic" },
  { tag: rpicTags.attribute, color: "#9ccc65" },
  { tag: rpicTags.envvar, color: "#b3c98f" },
  { tag: t.function(t.variableName), color: "#8bc98f" },
  { tag: t.macroName, color: "#8bc98f", fontWeight: "bold" },
  { tag: t.labelName, color: "#c8e6c9", fontWeight: "bold" },
  { tag: t.string, color: "#d7c49e" },
  { tag: t.number, color: "#dce775" },
  { tag: rpicTags.ordinal, color: "#aed581", fontStyle: "italic" },
  { tag: rpicTags.corner, color: "#80cbc4" },
  { tag: rpicTags.arrowop, color: "#a5d6a7", fontWeight: "bold" },
  { tag: t.operator, color: "#90a99a" },
  // tags genéricas (abas SVG/Markdown em modo leitura)
  { tag: t.tagName, color: "#a5d6a7" },
  { tag: t.attributeName, color: "#9ccc65" },
  { tag: t.attributeValue, color: "#d7c49e" },
  { tag: t.angleBracket, color: "#90a99a" },
  { tag: t.heading, color: "#c8e6c9", fontWeight: "bold" },
  { tag: t.link, color: "#80cbc4", textDecoration: "underline" },
  { tag: t.url, color: "#80cbc4" },
  { tag: t.monospace, color: "#dce775" },
  { tag: t.quote, color: "#b3c98f", fontStyle: "italic" },
  { tag: t.processingInstruction, color: "#6f8274" },
  { tag: t.blockComment, color: "#6f8274", fontStyle: "italic" },
  // CSS (painel de classes) — tags do @codemirror/lang-css
  { tag: t.propertyName, color: "#9ccc65" },
  { tag: t.className, color: "#c8e6c9", fontWeight: "bold" },
  { tag: t.keyword, color: "#81c784" },
  { tag: t.atom, color: "#aed581" },
  { tag: t.unit, color: "#dce775" },
  { tag: t.color, color: "#4db6ac" },
  { tag: t.definitionKeyword, color: "#81c784", fontWeight: "bold" },
]);

// ---- rpic-forest-light (fundo #f7faf7, dado pelo painel via --color-ink) ----
const lightChrome = chromeTheme(
  {
    text: "#25342a",
    muted: "#8a9a8d",
    faint: "#aebbaf",
    caret: "#2e7d32",
    selection: "rgba(46, 125, 50, 0.16)",
    activeLine: "rgba(27, 94, 32, 0.045)",
    matchingBracket: "rgba(46, 125, 50, 0.2)",
    raised: "#eef3ee",
    border: "#dde7de",
    diagnosticBorder: "#c62828",
  },
  false,
);

const lightHighlight = HighlightStyle.define([
  { tag: t.lineComment, color: "#8a9a8d", fontStyle: "italic" },
  { tag: rpicTags.directive, color: "#1b5e20", fontWeight: "bold" },
  { tag: t.controlKeyword, color: "#1b5e20", fontWeight: "bold" },
  { tag: rpicTags.primitive, color: "#2e7d32", fontWeight: "bold" },
  { tag: rpicTags.extension, color: "#00695c", fontWeight: "bold", fontStyle: "italic" },
  { tag: rpicTags.attribute, color: "#33691e" },
  { tag: rpicTags.envvar, color: "#4e6e33" },
  { tag: t.function(t.variableName), color: "#386641" },
  { tag: t.macroName, color: "#386641", fontWeight: "bold" },
  { tag: t.labelName, color: "#194d33", fontWeight: "bold" },
  { tag: t.string, color: "#6d5c2e" },
  { tag: t.number, color: "#827717" },
  { tag: rpicTags.ordinal, color: "#558b2f", fontStyle: "italic" },
  { tag: rpicTags.corner, color: "#00796b" },
  { tag: rpicTags.arrowop, color: "#2e7d32", fontWeight: "bold" },
  { tag: t.operator, color: "#546e5a" },
  // tags genéricas (abas SVG/Markdown em modo leitura)
  { tag: t.tagName, color: "#2e7d32" },
  { tag: t.attributeName, color: "#33691e" },
  { tag: t.attributeValue, color: "#6d5c2e" },
  { tag: t.angleBracket, color: "#546e5a" },
  { tag: t.heading, color: "#194d33", fontWeight: "bold" },
  { tag: t.link, color: "#00796b", textDecoration: "underline" },
  { tag: t.url, color: "#00796b" },
  { tag: t.monospace, color: "#827717" },
  { tag: t.quote, color: "#4e6e33", fontStyle: "italic" },
  { tag: t.processingInstruction, color: "#8a9a8d" },
  { tag: t.blockComment, color: "#8a9a8d", fontStyle: "italic" },
  // CSS (painel de classes) — tags do @codemirror/lang-css
  { tag: t.propertyName, color: "#33691e" },
  { tag: t.className, color: "#194d33", fontWeight: "bold" },
  { tag: t.keyword, color: "#1b5e20" },
  { tag: t.atom, color: "#558b2f" },
  { tag: t.unit, color: "#827717" },
  { tag: t.color, color: "#00695c" },
  { tag: t.definitionKeyword, color: "#1b5e20", fontWeight: "bold" },
]);

/** Extensão de tema conforme o modo do app. */
export function rpicEditorTheme(dark: boolean): Extension {
  return dark
    ? [darkChrome, syntaxHighlighting(darkHighlight)]
    : [lightChrome, syntaxHighlighting(lightHighlight)];
}
