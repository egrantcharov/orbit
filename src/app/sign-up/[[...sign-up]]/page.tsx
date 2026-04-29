import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-6 py-5">
        <Link href="/" aria-label="Back to home">
          <Logo size="md" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <SignUp />
      </main>
    </div>
  );
}
