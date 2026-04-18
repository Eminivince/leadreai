export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div
      role="status"
      style={{ width: size, height: size }}
      className="animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
    />
  );
}
