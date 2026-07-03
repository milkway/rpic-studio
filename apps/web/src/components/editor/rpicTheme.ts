// Tema "nanquim" do editor — tinta escura quente, sintaxe em tons de
// terra/salvia/âmbar, acento vermelhão. Alinhado aos tokens do design system.
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import { rpicTags } from "./rpicLanguage";

const ink = {
  bg: "#211e1a",
  raised: "#2b2721",
  border: "#3a352d",
  text: "#ece5d8",
  muted: "#8d8471",
  faint: "#6f675a",
  accent: "#e0764f",
  selection: "rgba(209, 70, 31, 0.22)",
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
      backgroundColor: "rgba(224, 118, 79, 0.25)",
      outline: "none",
    },
    ".cm-lint-marker": { width: "0.9em" },
    ".cm-diagnostic": {
      fontFamily: "var(--font-sans)",
      borderLeft: `3px solid ${ink.accent}`,
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

const highlight = HighlightStyle.define([
  { tag: t.lineComment, color: ink.muted, fontStyle: "italic" },
  { tag: t.string, color: "#dcb567" },
  { tag: rpicTags.directive, color: "#a09683", fontWeight: "600" },
  { tag: t.labelName, color: "#f0c96a", fontWeight: "600" },
  { tag: rpicTags.ordinal, color: "#d8927a" },
  { tag: t.controlKeyword, color: "#e0764f", fontWeight: "500" },
  { tag: rpicTags.extension, color: "#c795c1" },
  { tag: rpicTags.primitive, color: "#9dc08b", fontWeight: "500" },
  { tag: rpicTags.attribute, color: "#c9b998" },
  { tag: rpicTags.envvar, color: "#a3c0d0" },
  { tag: t.function(t.variableName), color: "#d9a05b" },
  { tag: t.macroName, color: "#aec9e5" },
  { tag: rpicTags.corner, color: "#96bfc9" },
  { tag: t.number, color: "#e2b184" },
  { tag: rpicTags.arrowop, color: "#e0764f", fontWeight: "600" },
  { tag: t.operator, color: "#b7ab93" },
]);

export function rpicEditorTheme(): Extension {
  return [editorTheme, syntaxHighlighting(highlight)];
}
