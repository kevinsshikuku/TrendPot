"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/admin/donations", label: "Donations" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/challenges/new", label: "Challenges" }
];

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-slate-500">Operations</p>
      <ul className="space-y-1">
        {navLinks.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const baseStyles = "flex items-center justify-between rounded-2xl px-4 py-2 text-sm font-medium transition";
          const stateStyles = isActive
            ? "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/70"
            : "text-slate-300 hover:bg-slate-800/60 hover:text-white";

          return (
            <li key={link.href}>
              <Link href={link.href} className={`${baseStyles} ${stateStyles}`}>
                <span>{link.label}</span>
                <span aria-hidden className="text-xs text-slate-500">
                  {isActive ? "•" : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
