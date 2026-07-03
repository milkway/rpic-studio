import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { ToastProvider } from "@/components/ui/Toast";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { EditorPage } from "@/routes/EditorPage";
import { ExamplesPage } from "@/routes/ExamplesPage";
import { HelpPage } from "@/routes/HelpPage";
import { DiagramsPage } from "@/routes/DiagramsPage";
import { SharedPage } from "@/routes/SharedPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={350}>
            <ToastProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/" element={<EditorPage />} />
              <Route path="/e/:id" element={<EditorPage />} />
              <Route path="/d/:slug" element={<SharedPage />} />
              <Route path="/diagramas" element={<DiagramsPage />} />
              <Route path="/exemplos" element={<ExamplesPage />} />
              <Route path="/ajuda" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
            </ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
