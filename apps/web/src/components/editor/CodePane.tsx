import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
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
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { rpicLanguage } from "./rpicLanguage";
import { rpicEditorTheme } from "./rpicTheme";
import type { ErrorInfo } from "@/lib/errorInfo";

export interface CodePaneHandle {
  /** Move o cursor para a posição (1-based) e foca o editor. */
  focusAt: (line: number, col: number) => void;
}

interface CodePaneProps {
  value: string;
  onChange: (value: string) => void;
  /** Erros e avisos interpretados (sublinhado preciso + mensagem humana). */
  diagnostics: ErrorInfo[];
  /** Tema do app — alterna rpic-forest-light/dark. */
  dark: boolean;
  autoFocus?: boolean;
}

function toCmDiagnostics(state: EditorState, infos: ErrorInfo[]): Diagnostic[] {
  const doc = state.doc;
  return infos.map((info) => {
    const line =
      info.line && info.line >= 1 && info.line <= doc.lines ? doc.line(info.line) : doc.line(1);
    const from = Math.min(line.from + Math.max((info.col ?? 1) - 1, 0), line.to);
    // sublinha só o token ofensor quando o comprimento é conhecido
    const to = info.tokenLength ? Math.min(from + info.tokenLength, line.to) : line.to;
    const message = info.suggestion ? `${info.friendly} ${info.suggestion}` : info.friendly;
    return { from, to: Math.max(to, from), severity: info.severity, message };
  });
}

const themeCompartment = new Compartment();

/** Editor CodeMirror 6 com a linguagem rpic e os temas rpic-forest. */
export const CodePane = forwardRef<CodePaneHandle, CodePaneProps>(function CodePane(
  { value, onChange, diagnostics, dark, autoFocus },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialDarkRef = useRef(dark);

  useImperativeHandle(ref, () => ({
    focusAt(line, col) {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
      const pos = Math.min(target.from + Math.max(col - 1, 0), target.to);
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          lintGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          dropCursor(),
          history(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          rpicLanguage(),
          themeCompartment.of(rpicEditorTheme(initialDarkRef.current)),
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

  // Troca de tema ao alternar claro/escuro.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(rpicEditorTheme(dark)),
    });
  }, [dark]);

  // Sincroniza mudanças externas (exemplo carregado, link importado, reset).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Reflete erros/avisos do compilador como diagnósticos inline.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view.state, diagnostics)));
  }, [diagnostics]);

  return <div ref={hostRef} data-testid="code-pane" className="h-full min-h-0" />;
});
