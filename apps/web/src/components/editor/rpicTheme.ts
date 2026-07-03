// Tema "rpic-forest-dark" do editor — porte fiel do tema Shiki/VS Code
// oficial do rpic (rpic/tools/highlight/themes/rpic-forest-dark.json).
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import { rpicTags } from "./rpicLanguage";

const ink = {
  bg: "#1e2823",
  raised: "#273229",
  border: "#37453b",
  text: "#d3e0d5",
  muted: "#6f8274",
  faint: "#556258",
  accent: "#81c784",
  selection: "rgba(129, 199, 132, 0.22)",
};

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: ink.text,
      fontSize: "13.5px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-content": { caretColor: ink.accent, padding: "14px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: ink.accent, borderLeftWidth: "2px" },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection": {
      backgroundColor: ink.selection,
    },
    ".cm-selectionBackground": { backgroundColor: "rgba(255,255,255,0.06)" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.035)" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: ink.faint,
      border: "none",
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: ink.muted },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(129, 199, 132, 0.25)",
      outline: "none",
    },
    ".cm-lint-marker": { width: "0.9em" },
    ".cm-diagnostic": {
      fontFamily: "var(--font-sans)",
      borderLeft: `3px solid #e57373`,
    },
    ".cm-tooltip": {
      backgroundColor: ink.raised,
      color: ink.text,
      border: `1px solid ${ink.border}`,
      borderRadius: "8px",
    },
    ".cm-panels": { backgroundColor: ink.raised, color: ink.text },
  },
  { dark: true },
);

// Cores 1:1 com rpic-forest-dark.json (scope → tag equivalente).
const highlight = HighlightStyle.define([
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
]);

export function rpicEditorTheme(): Extension {
  return [editorTheme, syntaxHighlighting(highlight)];
}
