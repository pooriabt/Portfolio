import Link from "next/link";

export default function DesignWorksPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Design Works
      </h1>
      <p className="max-w-2xl text-lg text-white/80">
        A focused space for architectural, jewelry, and industrial explorations.
        Detailed case studies and renders are coming soon—stay tuned!
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm uppercase tracking-widest transition hover:bg-white/20"
      >
        Back to portals
      </Link>
    </main>
  );
}

