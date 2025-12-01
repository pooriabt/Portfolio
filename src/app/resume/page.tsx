import Link from "next/link";

export default function ResumePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <p className="text-sm uppercase tracking-[0.4em] text-white/70">
        Wavy Header · RESUME
      </p>
      <h1 className="text-4xl font-semibold">Resume & Credentials</h1>
      <p className="max-w-2xl text-lg text-white/70">
        A downloadable CV, project history, and certifications section will be
        added here so the “resume” wavy link has a dedicated landing spot.
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

