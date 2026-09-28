export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
