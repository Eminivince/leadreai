export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className="animate-spin rounded-full border-2 border-border border-t-foreground"
    />
  );
}
