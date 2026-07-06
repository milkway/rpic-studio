import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { bracketMatching } from "@codemirror/language";
import { rpicEditorTheme } from "./rpicTheme";

/** Editor de CSS pequeno e EDITÁVEL (CodeMirror 6 + highlight css), usado no
 *  painel de CSS custom. Criado uma vez; valor externo sincronizado; tema via
 *  Compartment (troca claro/escuro sem recriar). */
export function CssEditor({
  value,
  onChange,
  dark,
}: {
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const themeRef = useRef(new Compartment());
  const initialDarkRef = useRef(dark);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          css(),
          themeRef.current.of(rpicEditorTheme(initialDarkRef.current)),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // criado uma vez; `value` inicial vem do primeiro render.
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeRef.current.reconfigure(rpicEditorTheme(dark)) });
  }, [dark]);

  // Sincroniza mudança externa (round-trip do readCss/applyCss é 1:1 → sem
  // reescrever quando o próprio editor originou a mudança → cursor estável).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== value) view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} data-testid="css-editor" className="max-h-56 overflow-auto rounded-(--radius-sm) border border-(--color-border) [&_.cm-editor]:bg-(--color-ink)" />;
}
