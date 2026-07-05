import type { ReactNode } from "react";
import { ShieldAlert, Users as UsersIcon, Wifi } from "lucide-react";
import { AppShell } from "@/components/app-shell/AppShell";
import { ApiError } from "@/lib/api";
import { formatDate, useI18n } from "@/lib/i18n";
import { useMe, useUsers } from "@/lib/queries";

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3.5 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5 shadow-(--shadow-sm)">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-accent-soft) text-(--color-accent)">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-(--color-text)">{value}</p>
        <p className="text-xs text-(--color-text-muted)">{label}</p>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-(--color-border) last:border-0">
      <td className="px-4 py-3">
        <div className="h-3.5 w-40 animate-pulse rounded-(--radius-sm) bg-(--color-surface-muted)" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-28 animate-pulse rounded-(--radius-sm) bg-(--color-surface-muted)" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-24 animate-pulse rounded-(--radius-sm) bg-(--color-surface-muted)" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-24 animate-pulse rounded-(--radius-sm) bg-(--color-surface-muted)" />
      </td>
    </tr>
  );
}

/** Admin: quem já fez login no app, com sessões ativas e último acesso. */
export function UsersPage() {
  const { t, locale } = useI18n();
  const { data: me, isLoading: meLoading } = useMe();
  const users = useUsers(!!me?.is_admin);

  const forbidden = users.error instanceof ApiError && users.error.status === 403;
  const sorted = users.data
    ? [...users.data.users].sort(
        (a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime(),
      )
    : [];

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            {t("users.title")}
          </h1>
          <p className="mt-2 max-w-xl text-(--color-text-body)">{t("users.subtitle")}</p>

          <div className="mt-8">
            {meLoading ? null : !me ? (
              <div
                data-testid="users-signin-required"
                className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center"
              >
                <ShieldAlert className="mx-auto mb-3 text-(--color-text-muted)" size={28} />
                <p className="text-(--color-text-body)">{t("users.signInRequired")}</p>
              </div>
            ) : !me.is_admin || forbidden ? (
              <div
                data-testid="users-forbidden"
                className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center"
              >
                <ShieldAlert className="mx-auto mb-3 text-(--color-text-muted)" size={28} />
                <p className="text-(--color-text-body)">{t("users.forbidden")}</p>
              </div>
            ) : users.isLoading ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="h-20 animate-pulse rounded-(--radius-lg) bg-(--color-surface-muted)" />
                  <div className="h-20 animate-pulse rounded-(--radius-lg) bg-(--color-surface-muted)" />
                </div>
                <div className="mt-8 overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </tbody>
                  </table>
                </div>
              </>
            ) : users.isError ? (
              <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center text-(--color-text-body)">
                {t("users.loadError")}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <StatCard
                    icon={<UsersIcon size={18} />}
                    label={t("users.total")}
                    value={users.data?.total ?? 0}
                  />
                  <StatCard
                    icon={<Wifi size={18} />}
                    label={t("users.activeSessions")}
                    value={users.data?.activeSessions ?? 0}
                  />
                </div>

                <div className="mt-8">
                  {sorted.length === 0 ? (
                    <div className="rounded-(--radius-lg) border border-dashed border-(--color-border-strong) p-10 text-center text-(--color-text-body)">
                      {t("users.empty")}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-(--color-border) text-xs text-(--color-text-muted) uppercase">
                            <th className="px-4 py-3 font-medium">{t("users.col.email")}</th>
                            <th className="px-4 py-3 font-medium">{t("users.col.name")}</th>
                            <th className="px-4 py-3 font-medium">{t("users.col.createdAt")}</th>
                            <th className="px-4 py-3 font-medium">{t("users.col.lastLogin")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((u) => (
                            <tr
                              key={u.email}
                              data-testid="user-row"
                              className="border-b border-(--color-border) last:border-0"
                            >
                              <td className="px-4 py-3 text-(--color-text)">{u.email}</td>
                              <td className="px-4 py-3 text-(--color-text-body)">{u.name}</td>
                              <td className="px-4 py-3 font-mono text-xs text-(--color-text-muted)">
                                {formatDate(u.createdAt, locale)}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-(--color-text-muted)">
                                {formatDate(u.lastLogin, locale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
