import WavyNavHeader from "@/components/WavyNavHeader";

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <WavyNavHeader />
      <div className="mt-24">
        <h1 className="text-4xl font-semibold mb-4">About The Practice</h1>
        <p className="max-w-2xl text-lg text-white/70">
          A deeper bio, design philosophy, and process breakdown will live here,
          mirroring the "about" wavy link from the hero experience.
        </p>
      </div>
    </main>
  );
}
