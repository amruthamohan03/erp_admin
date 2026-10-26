// §4.40 — the lines under an input: one blocking error in red, or the
// non-blocking warnings in amber. The one rendering of both, so a hand-written
// form and a metadata page look the same (§4.10). Both hues state their dark
// reading (§4.32).
export default function FieldMessages({ error, warnings = [] }: { error?: string | null; warnings?: string[] }) {
  if (!error && warnings.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        warnings.map((w) => (
          <p key={w} className="text-xs text-amber-700 dark:text-amber-300">
            {w}
          </p>
        ))
      )}
    </div>
  );
}
