export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-muted" style={{ animationDelay: '75ms' }} />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border-l-4 border-l-muted bg-card ring-1 ring-foreground/5 skeleton-stagger"
          >
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="h-5 w-36 rounded bg-muted" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-16 rounded-full bg-muted" />
                  <div className="h-5 w-14 rounded-full bg-muted" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
            <div className="flex items-center justify-between border-t bg-muted/30 p-4">
              <div className="flex gap-3">
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
              <div className="flex -space-x-2">
                <div className="size-6 rounded-full bg-muted" />
                <div className="size-6 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
