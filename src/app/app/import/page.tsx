"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Sparkles, UserPlus } from "lucide-react";
import { AddContactModal } from "@/components/app/AddContactModal";
import { OrphanRescueRow } from "@/components/app/OrphanRescueRow";
import type { ImportRow } from "@/app/api/contacts/import/route";

type Field = keyof ImportRow | "ignore";

const FIELDS: Array<{ key: Field; label: string }> = [
  { key: "ignore", label: "(ignore)" },
  { key: "email", label: "Email" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "display_name", label: "Display name" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job title" },
  { key: "industry", label: "Industry" },
  { key: "location", label: "Location" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "birthday", label: "Birthday" },
  { key: "connected_on", label: "Connected on" },
  { key: "notes", label: "Notes" },
];

// LinkedIn export header → our field. Detection is case-insensitive.
const LINKEDIN_GUESS: Record<string, Field> = {
  "first name": "first_name",
  "last name": "last_name",
  "email address": "email",
  email: "email",
  company: "company",
  position: "job_title",
  "job title": "job_title",
  title: "job_title",
  industry: "industry",
  location: "location",
  url: "linkedin_url",
  "linkedin url": "linkedin_url",
  "profile url": "linkedin_url",
  "connected on": "connected_on",
  birthday: "birthday",
  "date of birth": "birthday",
  notes: "notes",
};

function guessField(header: string): Field {
  const k = header.trim().toLowerCase();
  return LINKEDIN_GUESS[k] ?? "ignore";
}

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const manualOpen = searchParams.get("manual") === "1";
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field>>({});
  const [busy, setBusy] = useState(false);

  function onFile(file: File) {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(res) {
        const hdrs = (res.meta.fields ?? []).filter(Boolean);
        const m: Record<string, Field> = {};
        for (const h of hdrs) m[h] = guessField(h);
        setHeaders(hdrs);
        setRows(res.data);
        setMapping(m);
      },
      error(err) {
        toast.error("CSV parse failed: " + err.message);
      },
    });
  }

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const usableHeaders = headers.filter(
    (h) => mapping[h] && mapping[h] !== "ignore",
  );
  const hasIdentifier =
    usableHeaders.some((h) => mapping[h] === "email") ||
    usableHeaders.some((h) => mapping[h] === "linkedin_url");

  async function submit() {
    if (busy) return;
    if (rows.length === 0) {
      toast.error("Pick a CSV first");
      return;
    }
    if (!hasIdentifier) {
      toast.error("Map at least one column to Email or LinkedIn URL");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Importing ${rows.length} rows…`);
    try {
      const normalized: ImportRow[] = rows.map((r) => {
        const out: Record<string, string | null> = {};
        for (const h of headers) {
          const target = mapping[h];
          if (!target || target === "ignore") continue;
          const v = r[h];
          if (v == null || v === "") continue;
          out[target] = v;
        }
        return out as ImportRow;
      });

      // chunk in 500s to stay under MAX_ROWS=5000 hard cap and keep payloads
      // reasonable.
      let created = 0;
      let enriched = 0;
      let skipped = 0;
      for (let i = 0; i < normalized.length; i += 500) {
        const slice = normalized.slice(i, i + 500);
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: slice }),
        });
        if (!res.ok) throw new Error(`Import failed (${res.status})`);
        const j = (await res.json()) as { created?: number; enriched?: number; skipped?: number };
        created += j.created ?? 0;
        enriched += j.enriched ?? 0;
        skipped += j.skipped ?? 0;
      }
      toast.success(
        `Created ${created}, enriched ${enriched}, skipped ${skipped}`,
        { id: t },
      );
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-4xl w-full mx-auto">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Import contacts</h1>
          <p className="text-sm text-muted-foreground">
            Drop a CSV — LinkedIn{" "}
            <span className="font-medium text-foreground">Connections.csv</span>{" "}
            works out of the box. Existing contacts are enriched in place; new
            rows are tagged{" "}
            <span className="font-medium text-foreground">linkedin</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            LinkedIn&apos;s export doesn&apos;t include birthdays — add them
            manually on each contact&apos;s page.
          </p>
        </div>
        <AddContactModal
          defaultOpen={manualOpen}
          trigger={
            <Button variant="outline">
              <UserPlus className="h-4 w-4" />
              Add manually
            </Button>
          }
        />
      </div>

      <OrphanRescueRow />

      <Card className="p-6 flex flex-col items-center gap-3 text-center border-dashed">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <Upload className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1 items-center">
          <h2 className="text-base font-semibold">Pick a CSV</h2>
          {fileName ? (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              {fileName} · {rows.length.toLocaleString()} rows
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              .csv exported from LinkedIn or any tool
            </p>
          )}
        </div>
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="max-w-xs"
        />
      </Card>

      {headers.length > 0 && (
        <>
          <Card className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Column mapping</h2>
              <span className="text-xs text-muted-foreground">
                {usableHeaders.length} of {headers.length} mapped
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {headers.map((h) => (
                <label
                  key={h}
                  className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-2"
                >
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    {h}
                  </span>
                  <select
                    className="bg-transparent text-sm outline-none focus:ring-0"
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [h]: e.target.value as Field }))
                    }
                  >
                    {FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Preview</h2>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1 whitespace-nowrap max-w-[14rem] truncate">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy || !hasIdentifier} size="lg">
              <Sparkles className="h-4 w-4" />
              Import {rows.length.toLocaleString()} rows
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
