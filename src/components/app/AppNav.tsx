"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, BookmarkIcon, Newspaper, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "Contacts", icon: Users, prefix: "/app" as const, exact: true },
  { href: "/app/library", label: "Library", icon: BookmarkIcon, prefix: "/app/library" as const, exact: false },
  { href: "/app/digest", label: "Digest", icon: Newspaper, prefix: "/app/digest" as const, exact: false },
  { href: "/app/import", label: "Import", icon: Upload, prefix: "/app/import" as const, exact: false },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact
          ? pathname === item.href ||
            // /app/contact/[id] also belongs to Contacts
            (pathname.startsWith("/app/contact") && item.href === "/app")
          : pathname.startsWith(item.prefix);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
