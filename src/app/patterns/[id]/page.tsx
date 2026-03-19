import PatternPageClient from './PatternPageClient';

// A placeholder param is required for static export to work.
// Real pattern IDs are handled at runtime via client-side routing.
// When a user navigates to /patterns/<real-id>, GitHub Pages serves 404.html
// which redirects to the SPA, and the client component fetches by ID.
export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function PatternPage() {
  return <PatternPageClient />;
}
