import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Deterministic color from a string (e.g. an email). Used to color avatars
 * consistently for the same person across the app.
 */
export function avatarColorClass(seed: string): {
  bg: string;
  text: string;
} {
  const hash = Array.from(seed).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360,
    7,
  );
  // tailwind-safe palette of 12 hues, all with comfortable contrast in
  // both light and dark mode.
  const palette: Array<{ bg: string; text: string }> = [
    { bg: "bg-rose-100 dark:bg-rose-950/60", text: "text-rose-700 dark:text-rose-300" },
    { bg: "bg-amber-100 dark:bg-amber-950/60", text: "text-amber-700 dark:text-amber-300" },
    { bg: "bg-yellow-100 dark:bg-yellow-950/60", text: "text-yellow-700 dark:text-yellow-300" },
    { bg: "bg-lime-100 dark:bg-lime-950/60", text: "text-lime-700 dark:text-lime-300" },
    { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300" },
    { bg: "bg-teal-100 dark:bg-teal-950/60", text: "text-teal-700 dark:text-teal-300" },
    { bg: "bg-cyan-100 dark:bg-cyan-950/60", text: "text-cyan-700 dark:text-cyan-300" },
    { bg: "bg-sky-100 dark:bg-sky-950/60", text: "text-sky-700 dark:text-sky-300" },
    { bg: "bg-indigo-100 dark:bg-indigo-950/60", text: "text-indigo-700 dark:text-indigo-300" },
    { bg: "bg-violet-100 dark:bg-violet-950/60", text: "text-violet-700 dark:text-violet-300" },
    { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/60", text: "text-fuchsia-700 dark:text-fuchsia-300" },
    { bg: "bg-pink-100 dark:bg-pink-950/60", text: "text-pink-700 dark:text-pink-300" },
  ];
  return palette[hash % palette.length];
}

export function emailDomain(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1) : email;
}
