'use client';

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="p-6 text-red-400 font-mono text-sm whitespace-pre-wrap">
      <p className="font-bold mb-2">Something went wrong:</p>
      <p>{error?.message}</p>
      {error?.stack && <p className="mt-2 text-xs text-red-600">{error.stack}</p>}
    </div>
  );
}
