import type { ReactNode } from 'react';

export function Privacy({ deleteAccount }: { deleteAccount?: ReactNode }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p><strong>No analytics, no tracking, no ads.</strong> The site makes no request to anything except its own database.</p>
      <h2 className="pt-2 font-semibold">On this device</h2>
      <p>Your topics, keywords, packs, sources, favorites, tags, “Less like this” marks and reading days are kept in this browser’s local storage. Nothing is sent anywhere before you finish setup.</p>
      <h2 className="pt-2 font-semibold">If you sign in</h2>
      <p>The same items are stored in the site’s database so they sync between your devices. Each row is readable and writable only by you. Signing in with GitHub shares your GitHub email and username with the site; nothing else.</p>
      <h2 className="pt-2 font-semibold">What’s public</h2>
      <p>The morning scrub itself — story titles, links and AI-written summaries — is public for everyone.</p>
      {deleteAccount}
    </div>
  );
}
