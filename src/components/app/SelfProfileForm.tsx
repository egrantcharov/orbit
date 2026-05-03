"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SelfProfile } from "@/lib/types/database";

const AGE_BRACKETS = ["", "teens", "20s", "30s", "40s", "50s", "60s", "70s+"];

export function SelfProfileForm({ initial }: { initial: SelfProfile }) {
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [role, setRole] = useState(initial.role ?? "");
  const [ageBracket, setAgeBracket] = useState(initial.age_bracket ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Saving…");
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: industry.trim() || null,
          role: role.trim() || null,
          age_bracket: ageBracket || null,
          location: location.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      toast.success("Saved", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 flex flex-col gap-5">
      <Field label="Industry" hint="e.g. Software, Finance, Healthcare">
        <Input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Software"
        />
      </Field>
      <Field label="Role" hint="e.g. Founder, Engineer, Designer, MBA student">
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Engineer"
        />
      </Field>
      <Field label="Age bracket" hint="Used to estimate age proximity to your contacts">
        <select
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          value={ageBracket}
          onChange={(e) => setAgeBracket(e.target.value)}
        >
          {AGE_BRACKETS.map((a) => (
            <option key={a} value={a}>
              {a || "(unset)"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location" hint="City or region">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Chicago, IL"
        />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
