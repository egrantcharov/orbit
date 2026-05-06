import { redirect } from "next/navigation";

// v3.8: Digest replaced by Synth. Old route redirects.
export default function DigestRedirect(): never {
  redirect("/app/synth");
}
