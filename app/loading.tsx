export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-[var(--color-line)]" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
