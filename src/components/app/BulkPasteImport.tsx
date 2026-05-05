"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ClipboardPaste, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImportRow } from "@/app/api/contacts/import/route";

// Heuristic header detection — if the first line starts with one of these
// tokens, we treat the paste as headered. Otherwise we assume positional:
//   name, email, company, title, team, school
const HEADER_TOKENS = [
  "name",
  "email",
  "first name",
  "last name",
  "company",
  "firm",
  "position",
  "title",
];

const POSITIONAL_FIELDS: Array<keyof ImportRow> = [
  "display_name",
  "email",
  "company",
  "job_title",
  "team",
  "school",
];

const HEADER_MAP: Record<string, keyof ImportRow> = {
  name: "display_name",
  "full name": "display_name",
  "first name": "first_name",
  "last name": "last_name",
  "display name": "display_name",
  email: "email",
  "email address": "email",
  company: "company",
  firm: "company",
  position: "job_title",
  title: "job_title",
  "job title": "job_title",
  industry: "industry",
  sector: "sector",
  team: "team",
  group: "team",
  school: "school",
  university: "school",
  location: "location",
  url: "linkedin_url",
  "linkedin url": "linkedin_url",
  birthday: "birthday",
  "connected on": "connected_on",
  notes: "notes",
};

export function BulkPasteImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: ImportRow[]; headerLine: string | null } | null>(null);

  function detectHeader(firstLine: string): boolean {
    const tokens = firstLine
      .split(/[,\t]/)
      .map((t) => t.trim().toLowerCase());
    return tokens.some((t) => HEADER_TOKENS.includes(t));
  }

  function parse(): { rows: ImportRow[]; headerLine: string | null } {
    const raw = text.trim();
    if (!raw) return { rows: [], headerLine: null };
    const firstLine = raw.split(/\r?\n/)[0] ?? "";
    const hasHeader = detectHeader(firstLine);

    if (hasHeader) {
      const res = Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: "greedy",
      });
      const rows: ImportRow[] = (res.data ?? [])
        .map((r) => {
          const out: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(r)) {
            if (v == null || v === "") continue;
            const target = HEADER_MAP[k.trim().toLowerCase()];
            if (!target) continue;
            out[target] = v;
          }
          return out as ImportRow;
        })
        .filter((r) => Object.keys(r).length > 0);
      return { rows, headerLine: firstLine };
    }

    // Positional: name, email, company, title, team, school
    const res = Papa.parse<string[]>(raw, {
      header: false,
      skipEmptyLines: "greedy",
    });
    const rows: ImportRow[] = (res.data ?? [])
      .map((cells) => {
        const out: Record<string, string | null> = {};
        cells.forEach((cell, idx) => {
          const target = POSITIONAL_FIELDS[idx];
          if (!target) return;
          const v = cell?.trim();
          if (v) out[target] = v;
        });
        return out as ImportRow;
      })
      .filter((r) => Object.keys(r).length > 0);
    return { rows, headerLine: null };
  }

  function previewIt() {
    const p = parse();
    setPreview(p);
    if (p.rows.length === 0) {
      toast.error("Nothing to import — paste rows first.");
    }
  }

  async function submit() {
    if (busy) return;
    const parsed = preview ?? parse();
    if (parsed.rows.length === 0) {
      toast.error("Nothing to import.");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Importing ${parsed.rows.length} rows…`);
    try {
      let created = 0;
      let enriched = 0;
      let skipped = 0;
      for (let i = 0; i < parsed.rows.length; i += 200) {
        const slice = parsed.rows.slice(i, i + 200);
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: slice }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Import failed: ${j.error ?? `HTTP ${res.status}`}`);
        }
        const j = (await res.json()) as {
          created?: number;
          enriched?: number;
          skipped?: number;
        };
        created += j.created ?? 0;
        enriched += j.enriched ?? 0;
        skipped += j.skipped ?? 0;
      }
      toast.success(
        `Created ${created}, enriched ${enriched}, skipped ${skipped}`,
        { id: t },
      );
      setText("");
      setPreview(null);
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Bulk paste</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste rows separated by commas or tabs. With a header row we map by
        column name (Name / Email / Company / Title / Team / Sector / School / LinkedIn / Notes).
        Without one we read positionally:{" "}
        <span className="font-mono">name, email, company, title, team, school</span>.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (preview) setPreview(null);
        }}
        rows={8}
        placeholder={`Emil Grantcharov, emil@example.com, Goldman Sachs, IB Analyst, TMT, UChicago
Sarah Chen\tsarah@gs.com\tGoldman Sachs\tVP\tHealthcare\tWharton`}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={previewIt} disabled={!text.trim()}>
          Preview
        </Button>
        <Button size="sm" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Import
        </Button>
        {preview && (
          <span className="text-xs text-muted-foreground ml-auto">
            {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} ready
            {preview.headerLine ? " · header detected" : " · positional"}
          </span>
        )}
      </div>
      {preview && preview.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="text-xs w-full">
            <thead className="text-left text-muted-foreground bg-secondary/30">
              <tr>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Email</th>
                <th className="px-2 py-1 font-medium">Company</th>
                <th className="px-2 py-1 font-medium">Title</th>
                <th className="px-2 py-1 font-medium">Team</th>
                <th className="px-2 py-1 font-medium">School</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">
                    {r.display_name ??
                      [r.first_name, r.last_name].filter(Boolean).join(" ") ??
                      ""}
                  </td>
                  <td className="px-2 py-1">{r.email ?? ""}</td>
                  <td className="px-2 py-1">{r.company ?? ""}</td>
                  <td className="px-2 py-1">{r.job_title ?? ""}</td>
                  <td className="px-2 py-1">{r.team ?? ""}</td>
                  <td className="px-2 py-1">{r.school ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rows.length > 5 && (
            <p className="text-[11px] text-muted-foreground px-2 py-1">
              Showing first 5 of {preview.rows.length}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
