export default function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-xl bg-muted" />
        <div className="mx-auto h-6 w-32 animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
