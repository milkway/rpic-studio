// Tema claro/escuro como no site rpic.dev: classe `.dark` no <html>,
// persistida em localStorage; padrão segue prefers-color-scheme.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const THEME_KEY = "rpic:theme.v1";

function initialDark(): boolean {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    // storage bloqueado — segue o sistema
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      try {
        window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        // sem persistência — vale para a sessão
      }
      return next;
    });
  };

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
