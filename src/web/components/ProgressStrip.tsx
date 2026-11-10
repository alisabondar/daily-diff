export function ProgressStrip({ message }: { message: string }) {
  return (
    <div role="status" className="mb-6 flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-500 motion-safe:animate-pulse" />
      <span>Building today’s digest <span className="text-neutral-500">· {message.replace(/…$/, '')}</span></span>
    </div>
  );
}
