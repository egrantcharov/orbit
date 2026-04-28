import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">Orbit</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Stay close to the people and ideas that matter, without remembering
            to do the work.
          </p>
        </div>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Orbit auto-ingests your Gmail and calendar, builds a relationship
          timeline for everyone you know, and quietly nudges you toward the
          right next conversation.
        </p>
        <div className="flex gap-3 pt-2">
          {userId ? (
            <Link
              href="/app"
              className="inline-flex h-11 items-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Open Orbit
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex h-11 items-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                Get started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-11 items-center rounded-full border border-zinc-200 dark:border-zinc-800 px-6 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
