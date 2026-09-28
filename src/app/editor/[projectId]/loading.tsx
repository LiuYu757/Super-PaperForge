export default function EditorLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar skeleton */}
      <div className="flex h-12 items-center gap-2 border-b bg-muted/20 px-3">
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-7 animate-pulse rounded bg-muted" />
        <div className="h-7 w-20 animate-pulse rounded bg-muted" style={{ animationDelay: '100ms' }} />
        <div className="flex-1" />
        <div className="h-7 w-16 animate-pulse rounded bg-muted" style={{ animationDelay: '150ms' }} />
        <div className="h-7 w-16 animate-pulse rounded bg-muted" style={{ animationDelay: '200ms' }} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar skeleton */}
        <div className="flex w-[220px] flex-col border-r bg-muted/10">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            <div className="flex-1" />
            <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1.5"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="size-4 animate-pulse rounded bg-muted" />
                <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + Math.random() * 60}px` }} />
              </div>
            ))}
          </div>
        </div>

        {/* Editor area skeleton */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex h-8 items-center gap-1 border-b bg-muted/10 px-2">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded bg-muted/60" style={{ animationDelay: '100ms' }} />
          </div>
          {/* Code lines */}
          <div className="flex-1 space-y-2 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="w-6 text-right">
                  <div className="h-3 w-4 animate-pulse rounded bg-muted/40" />
                </div>
                <div
                  className="h-3 animate-pulse rounded bg-muted/60"
                  style={{ width: `${20 + Math.random() * 50}%` }}
                />
              </div>
            ))}
          </div>
          {/* Output panel */}
          <div className="h-32 border-t bg-muted/10 p-3">
            <div className="h-3 w-12 animate-pulse rounded bg-muted/40" />
          </div>
        </div>

        {/* PDF preview skeleton */}
        <div className="flex w-[45%] flex-col border-l bg-muted/10">
          <div className="flex h-8 items-center justify-center border-b px-2">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="h-[70%] w-[70%] animate-pulse rounded-lg bg-muted/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
