/** Shown in place of a list with no rows. `action` is usually a LinkButton. */
export function EmptyState({ title, description, action }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
