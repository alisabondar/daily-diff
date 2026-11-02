export function ProgressStrip({ message }: { message: string }) {
  return (
    <div className="mb-6 rounded bg-neutral-100 px-4 py-2 text-sm dark:bg-neutral-800">
      Building today's digest… {message}
    </div>
  );
}
