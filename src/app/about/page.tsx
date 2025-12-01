import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <p className="text-sm uppercase tracking-[0.4em] text-white/70">
        Wavy Header · ABOUT
      </p>
      <h1 className="text-4xl font-semibold">About The Practice</h1>
      <p className="max-w-2xl text-lg text-white/70">
        A deeper bio, design philosophy, and process breakdown will live here,
        mirroring the “about” wavy link from the hero experience.
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

