import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { rpicEditorTheme } from "@/components/editor/rpicTheme";

interface ReadOnlyCodeProps {
  content: string;
  language: "xml" | "markdown";
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
          language === "xml" ? xml() : markdown(),
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
