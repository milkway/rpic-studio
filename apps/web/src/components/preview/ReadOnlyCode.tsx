import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { r } from "@codemirror/legacy-modes/mode/r";
import { rpicEditorTheme } from "@/components/editor/rpicTheme";
import { rpicLanguage } from "@/components/editor/rpicLanguage";

export type CodeLanguage = "xml" | "markdown" | "python" | "r" | "rpic";

const LANGUAGES = {
  xml: () => xml(),
  markdown: () => markdown(),
  python: () => python(),
  r: () => StreamLanguage.define(r),
  rpic: () => rpicLanguage(),
};

interface ReadOnlyCodeProps {
  content: string;
  language: CodeLanguage;
  dark: boolean;
  testid?: string;
}

/** Código somente leitura com o highlight rpic-forest (abas SVG/Markdown). */
export function ReadOnlyCode({ content, language, dark, testid }: ReadOnlyCodeProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  // Recria a view quando o conteúdo/tema muda — barato, só existe na aba ativa.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          LANGUAGES[language](),
          rpicEditorTheme(dark),
          EditorView.lineWrapping,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
        ],
      }),
      parent: hostRef.current,
    });
    return () => view.destroy();
  }, [content, language, dark]);

  return (
    <div
      ref={hostRef}
      data-testid={testid}
      className="min-h-0 flex-1 overflow-hidden bg-(--color-ink) [&_.cm-editor]:h-full"
    />
  );
}
