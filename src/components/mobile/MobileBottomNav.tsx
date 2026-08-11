"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  CalendarDays,
  Bell,
  IndianRupee,
} from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "HOME", icon: Home },
  { href: "/parties", label: "PARTIES", icon: Users },
  { href: "/today", label: "TODAY", icon: CalendarDays },
  { href: "/sales", label: "SALES", icon: IndianRupee },
  { href: "/follow-ups", label: "FOLLOW-UP", icon: Bell },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${
                  active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
