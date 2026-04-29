import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-6xl w-full mx-auto">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
