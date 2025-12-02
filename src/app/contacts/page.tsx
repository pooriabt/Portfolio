import WavyNavHeader from "@/components/WavyNavHeader";

export default function ContactsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
      <WavyNavHeader />
      <div className="mt-24">
        <h1 className="text-4xl font-semibold mb-4">Get In Touch</h1>
        <p className="max-w-2xl text-lg text-white/70">
          Get in touch – email, social links, and a contact form will appear here,
          echoing the "contacts" wavy link from the main portal scene.
        </p>
      </div>
    </main>
  );
}
