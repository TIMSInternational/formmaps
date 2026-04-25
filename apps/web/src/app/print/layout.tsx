export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased print:bg-white print:text-black">
      {/* 
        This layout is intentionally stripped of all navigation and sidebars.
        It serves as a canvas for Puppeteer or browser printing.
      */}
      {children}
    </div>
  );
}
