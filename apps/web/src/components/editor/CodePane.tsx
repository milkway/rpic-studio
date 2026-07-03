import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { rpicLanguage } from "./rpicLanguage";
import { rpicEditorTheme } from "./rpicTheme";
import { errorPosition } from "@/lib/rpic";

interface CodePaneProps {
  value: string;
  onChange: (value: string) => void;
  /** Erro de compilação atual (vira sublinhado/lint no editor). */
  error: string | null;
  autoFocus?: boolean;
}

function errorToDiagnostics(state: EditorState, error: string): Diagnostic[] {
  const pos = errorPosition(error);
  const doc = state.doc;
  const line = pos && pos.line >= 1 && pos.line <= doc.lines ? doc.line(pos.line) : doc.line(1);
  const from = Math.min(line.from + Math.max((pos?.col ?? 1) - 1, 0), line.to);
  return [{ from, to: line.to, severity: "error", message: error }];
}

/** Editor CodeMirror 6 com a linguagem rpic e o tema nanquim. */
export function CodePane({ value, onChange, error, autoFocus }: CodePaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          dropCursor(),
          history(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          rpicLanguage(),
          rpicEditorTheme(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // O editor é criado uma única vez; `value` inicial vem do primeiro render.
  }, []);

  // Sincroniza mudanças externas (exemplo carregado, link importado, reset).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Reflete o erro do compilador como diagnóstico inline.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const diags = error ? errorToDiagnostics(view.state, error) : [];
    view.dispatch(setDiagnostics(view.state, diags));
  }, [error]);

  return <div ref={hostRef} data-testid="code-pane" className="h-full min-h-0" />;
}
