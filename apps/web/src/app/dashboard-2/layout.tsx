import { Suspense } from "react";
import { Sidebar } from "@/app/dashboard/_components/Sidebar";
import { GlassTopNav } from "./_components/GlassTopNav";
import { UIDesignProvider } from "@/components/ui-provider";

export default function Dashboard2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UIDesignProvider themeMode="glass">
      <div className="flex h-[100dvh] overflow-hidden bg-[#e6e2dd] relative font-sans">
        {/* Massive organic background anchor (GreenMotive style) */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* The main stone/crystal focal point */}
          {/* <div className="absolute top-[20%] left-[10%] w-[80%] h-[120%] opacity-90 scale-110">
          <img
            src="https://images.unsplash.com/photo-1682687982204-f1a77dccc306?q=80&w=2070&auto=format&fit=crop"
            alt="Central abstract geometric crystal"
            className="w-full h-full object-cover object-top opacity-[0.85] mix-blend-multiply drop-shadow-2xl"
          />
        </div> */}
          {/* Ambient vignette and overlay to soften the image and integrate it with the cream background */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#e6e2dd] via-[#e6e2dd]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#e6e2dd]/60 via-transparent to-transparent" />
        </div>

        {/* Dynamic Sidebar - matching perfectly but layered above bg */}
        <div className="flex-none hidden lg:block w-72 h-[100dvh] p-4 relative z-40">
          <Suspense fallback={<div className="w-full h-full bg-white/40 backdrop-blur-md rounded-[1.5rem]" />}>
            <Sidebar />
          </Suspense>
        </div>

        <div className="flex-1 flex flex-col min-w-0 h-[100dvh] relative z-30">
          <GlassTopNav />
          <main className="flex-1 overflow-y-auto scrollbar-hide w-full pb-20">
            {children}
          </main>
        </div>
      </div>
    </UIDesignProvider>
  );
}
