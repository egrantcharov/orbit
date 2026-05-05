"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type ContactProfile = {
  company: string | null;
  job_title: string | null;
  industry: string | null;
  location: string | null;
  birthday: string | null;
  linkedin_url: string | null;
  tags: string[];
  notes: string | null;
  met_at: string | null;
  met_on: string | null;
  met_via: string | null;
  interests: string | null;
};

export function ContactProfileEditor({
  contactId,
  initial,
}: {
  contactId: string;
  initial: ContactProfile;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const [company, setCompany] = useState(initial.company ?? "");
  const [jobTitle, setJobTitle] = useState(initial.job_title ?? "");
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [linkedin, setLinkedin] = useState(initial.linkedin_url ?? "");
  const [metAt, setMetAt] = useState(initial.met_at ?? "");
  const [metOn, setMetOn] = useState(initial.met_on ?? "");
  const [metVia, setMetVia] = useState(initial.met_via ?? "");
  const [interests, setInterests] = useState(initial.interests ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft("");
      return;
    }
    setTags([...tags, t]);
    setTagDraft("");
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Saving…");
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim() || null,
          job_title: jobTitle.trim() || null,
          industry: industry.trim() || null,
          location: location.trim() || null,
          birthday: birthday.trim() || null,
          linkedin_url: linkedin.trim() || null,
          met_at: metAt.trim() || null,
          met_on: metOn.trim() || null,
          met_via: metVia.trim() || null,
          interests: interests.trim() || null,
          notes: notes.trim() || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      toast.success("Saved", { id: t });
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    const summary: Array<[string, string | null]> = [
      ["Company", initial.company],
      ["Title", initial.job_title],
      ["Industry", initial.industry],
      ["Location", initial.location],
      ["Birthday", initial.birthday],
      ["Met at", initial.met_at],
      ["Met on", initial.met_on],
      ["Met via", initial.met_via],
      ["LinkedIn", initial.linkedin_url],
    ];
    const filled = summary.filter(([, v]) => v && v.trim().length > 0);
    return (
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Profile</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
        {filled.length === 0 &&
        (initial.tags ?? []).length === 0 &&
        !initial.notes &&
        !initial.interests ? (
          <p className="text-xs text-muted-foreground">
            Nothing yet. Add company, role, where/when you met, interests, or
            notes to ground search and scoring.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {filled.map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="truncate">
                    {k === "LinkedIn" ? (
                      <a
                        className="text-primary underline-offset-2 hover:underline"
                        href={v ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {v}
                      </a>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {(initial.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {initial.tags.map((t) => (
                  <Badge key={t} variant="muted" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {initial.interests && (
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Interests
                </span>
                <p className="text-sm leading-relaxed">{initial.interests}</p>
              </div>
            )}
            {initial.notes && (
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Notes
                </span>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {initial.notes}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Edit profile</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Title">
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <Field label="Industry">
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Birthday">
          <Input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </Field>
        <Field label="LinkedIn URL">
          <Input
            value={linkedin}
            placeholder="https://www.linkedin.com/in/…"
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-secondary/30 p-3">
        <Field label="Where you met">
          <Input
            value={metAt}
            onChange={(e) => setMetAt(e.target.value)}
            placeholder="MPCS class · NYC dinner · Twitter"
          />
        </Field>
        <Field label="When you met">
          <Input
            type="date"
            value={metOn}
            onChange={(e) => setMetOn(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="How you met / introduced by">
            <Input
              value={metVia}
              onChange={(e) => setMetVia(e.target.value)}
              placeholder="Intro from Sarah · Conference panel · Cold reach-out"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Shared interests / hobbies">
            <Input
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="tennis, AI startups, Italian wine"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium">Tags</label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="add tag, press enter"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium">Notes</label>
        <textarea
          className="min-h-[6rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you want to remember about this person."
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" />
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
