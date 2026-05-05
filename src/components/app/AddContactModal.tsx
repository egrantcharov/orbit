"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Save, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddContactModal({
  trigger,
  defaultOpen = false,
}: {
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [location, setLocation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [metAt, setMetAt] = useState("");
  const [metOn, setMetOn] = useState("");
  const [metVia, setMetVia] = useState("");
  const [interests, setInterests] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setDisplayName("");
    setEmail("");
    setCompany("");
    setJobTitle("");
    setLinkedin("");
    setLocation("");
    setBirthday("");
    setMetAt("");
    setMetOn("");
    setMetVia("");
    setInterests("");
    setNotes("");
    setMoreOpen(false);
  }

  async function save() {
    if (busy) return;
    if (!displayName.trim() && !email.trim()) {
      toast.error("Name or email required");
      return;
    }
    setBusy(true);
    const t = toast.loading("Saving…");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          email: email.trim() || null,
          company: company.trim() || null,
          job_title: jobTitle.trim() || null,
          linkedin_url: linkedin.trim() || null,
          location: location.trim() || null,
          birthday: birthday.trim() || null,
          met_at: metAt.trim() || null,
          met_on: metOn.trim() || null,
          met_via: metVia.trim() || null,
          interests: interests.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "duplicate") throw new Error("That contact already exists");
        throw new Error(`Save failed (${res.status})`);
      }
      const j = (await res.json()) as { id: string };
      toast.success("Contact added", { id: t });
      reset();
      setOpen(false);
      router.push(`/app/contact/${j.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UserPlus className="h-4 w-4" />
            Add contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>
            Drop a CSV at /app/import to bulk-add. This is for one-offs.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company">
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme"
              />
            </Field>
            <Field label="Title">
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Engineer"
              />
            </Field>
          </div>
          <Field label="LinkedIn URL">
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
            />
          </Field>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
          >
            {moreOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {moreOpen ? "Hide" : "Show"} relationship details
          </button>

          {moreOpen && (
            <div className="flex flex-col gap-3 rounded-lg border bg-secondary/30 p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location">
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Chicago, IL"
                  />
                </Field>
                <Field label="Birthday">
                  <Input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Where you met">
                  <Input
                    value={metAt}
                    onChange={(e) => setMetAt(e.target.value)}
                    placeholder="MPCS class, NYC dinner, Twitter…"
                  />
                </Field>
                <Field label="When you met">
                  <Input
                    type="date"
                    value={metOn}
                    onChange={(e) => setMetOn(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="How you met / introduced by">
                <Input
                  value={metVia}
                  onChange={(e) => setMetVia(e.target.value)}
                  placeholder="Intro from Sarah · Conference panel · Cold reach-out"
                />
              </Field>
              <Field label="Shared interests / hobbies">
                <Input
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="tennis, AI startups, Italian wine"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className="min-h-[6rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you want to remember."
                />
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
