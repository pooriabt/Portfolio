import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <p className="text-sm uppercase tracking-[0.4em] text-white/70">
        Wavy Header · HOME
      </p>
      <h1 className="text-4xl font-semibold">Exploration Hub</h1>
      <p className="max-w-2xl text-lg text-white/70">
        This space will highlight featured experiments, prototypes, and notes
        tied to the “home” wavy link. Content for this section is coming soon.
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

