"use client";

/**
 * Global keyboard shortcuts for the contact-detail page. Watches for single
 * letter keys when no input/textarea/contenteditable is focused, then
 * programmatically clicks the matching trigger button via its `data-shortcut`
 * attribute.
 *
 * Why DOM-click instead of state lifting? The action triggers (Email, Voice,
 * Schedule, Log) each own their own Dialog state. Hoisting that state into
 * the page would couple five components for a UX nicety. A documented
 * data-attribute contract stays local and survives refactors of any one
 * modal independently.
 *
 * Bindings (loosely inspired by Gmail / Linear):
 *   r — Record call
 *   e — Email
 *   c — Schedule
 *   l — Log interaction
 *   ? — show a help overlay (toast)
 */

import { useEffect } from "react";
import { toast } from "sonner";

type Binding = { key: string; selector: string; label: string };

const BINDINGS: Binding[] = [
  { key: "r", selector: '[data-shortcut="record"]', label: "Record call" },
  { key: "e", selector: '[data-shortcut="email"]', label: "Email" },
  { key: "c", selector: '[data-shortcut="schedule"]', label: "Schedule" },
  { key: "l", selector: '[data-shortcut="log"]', label: "Log interaction" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function ContactShortcuts() {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
      if (isTyping(ev.target)) return;

      const key = ev.key.toLowerCase();
      if (key === "?") {
        toast.info(
          BINDINGS.map((b) => `${b.key} → ${b.label}`).join(" · "),
        );
        return;
      }
      const hit = BINDINGS.find((b) => b.key === key);
      if (!hit) return;
      const el = document.querySelector<HTMLElement>(hit.selector);
      if (!el) return;
      ev.preventDefault();
      el.click();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
