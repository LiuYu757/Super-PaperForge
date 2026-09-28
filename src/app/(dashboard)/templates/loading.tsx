export default function TemplatesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-10 w-72 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
