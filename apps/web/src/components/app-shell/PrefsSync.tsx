import { useEffect, useRef } from "react";
import { useMe } from "@/lib/queries";
import { applyPrefs } from "@/lib/prefs";

/** Ao entrar, aplica as preferências salvas na conta (uma vez por usuário). */
export function PrefsSync() {
  const { data: me } = useMe();
  const appliedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!me || appliedFor.current === me.id) return;
    appliedFor.current = me.id;
    if (me.prefs && Object.keys(me.prefs).length > 0) {
      applyPrefs(me.prefs);
    }
  }, [me]);

  return null;
}
