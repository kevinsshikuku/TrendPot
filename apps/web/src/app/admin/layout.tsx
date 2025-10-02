import type { ReactNode } from "react";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-slate-800/80 bg-slate-950/40 p-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Admin</p>
              <h1 className="text-2xl font-semibold text-white">Operations control</h1>
              <p className="text-sm text-slate-400">
                Monitor platform health, reconcile payments, and orchestrate creator payouts from a single workspace.
              </p>
            </div>
            <AdminNavigation />
          </div>
        </aside>
        <div className="space-y-12">{children}</div>
      </div>
    </div>
  );
}
