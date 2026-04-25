"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Student,
  ChartPolar,
  BookBookmark
} from "@phosphor-icons/react";

const CARDS_DATA = [
  {
    label: "Current Term",
    icon: <Student weight="fill" className="w-10 h-10 md:w-16 md:h-16" />,
    title: "ACTIVE COURSE\nPLAN",
  },
  {
    label: "Performance",
    icon: <ChartPolar weight="fill" className="w-10 h-10 md:w-16 md:h-16" />,
    title: "COMPETENCY\nANALYTICS",
  },
  {
    label: "Resources",
    icon: <BookBookmark weight="fill" className="w-10 h-10 md:w-16 md:h-16" />,
    title: "LEARNING\nMATERIALS",
  },
];

const VARIANTS = ["1. Minimal Frost", "2. Dark Obsidian", "3. Liquid Aura"];

export function GlassPreviewSection() {
  const [activeVariant, setActiveVariant] = useState(0);

  return (
    <div className="w-full relative overflow-hidden font-sans selection:bg-black selection:text-white rounded-[2.5rem] mb-12 shadow-sm border border-slate-200/50">
      
      {/* Background Layer corresponding to current variant */}
      <div className="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000 bg-[#e7e5e1]">
        {activeVariant === 0 && (
          <div className="absolute inset-0 opacity-100 transition-opacity duration-1000">
            {/* Minimal Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] md:w-[100vw] md:h-[100vw] bg-[#cfccc2] rounded-full blur-[140px] opacity-90" />
            <div className="absolute top-1/2 left-[30%] -translate-x-1/2 -translate-y-[40%] w-[80vw] h-[100vw] bg-[#d1cbbd] rotate-12 blur-[100px] opacity-80" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-[#e1ddcf] rounded-full blur-[100px] opacity-90" />
          </div>
        )}
        {activeVariant === 1 && (
          <div className="absolute inset-0 bg-stone-950 opacity-100 transition-colors duration-1000 z-10">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[60vw] md:h-[60vw] bg-indigo-900/40 rounded-full blur-[140px]" />
            <div className="absolute top-[60%] left-[80%] -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] md:w-[40vw] md:h-[40vw] bg-rose-900/20 rounded-full blur-[120px]" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          </div>
        )}
        {activeVariant === 2 && (
          <div className="absolute inset-0 bg-[#f8f9fa] opacity-100 transition-colors duration-1000 z-10">
            {/* Moving Mesh gradient blobs */}
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute top-[10%] left-[15%] w-[60vw] h-[60vw] bg-rose-200/80 rounded-full blur-[120px] mix-blend-multiply opacity-80"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], rotate: [0, -90, 0] }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute top-[20%] right-[10%] w-[50vw] h-[50vw] bg-sky-200/80 rounded-full blur-[120px] mix-blend-multiply opacity-80"
            />
            <motion.div
              animate={{ scale: [1, 1.1, 1], translateY: [0, 80, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-[-10%] left-[30%] w-[70vw] h-[50vw] bg-emerald-200/60 rounded-full blur-[120px] mix-blend-multiply opacity-70"
            />
          </div>
        )}
      </div>

      {/* Navigation / Header for Preview Section */}
      <div className="relative z-30 flex flex-col md:flex-row w-full max-w-screen-xl mx-auto items-center justify-between p-6 gap-4 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-xl border border-white/30 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
            <span className={`text-[10px] uppercase tracking-widest font-bold ${activeVariant === 1 ? 'text-white' : 'text-stone-800'}`}>
              Client Preview
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1.5 p-1.5 bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-xl rounded-full border border-black/[0.05] dark:border-white/[0.05] w-full md:w-auto justify-center">
          {VARIANTS.map((variant, i) => (
            <button
              key={variant}
              onClick={() => setActiveVariant(i)}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300 ${
                activeVariant === i
                  ? activeVariant === 1
                    ? "bg-white text-stone-900 shadow-[0_2px_12px_rgba(255,255,255,0.1)]"
                    : "bg-stone-900 text-white shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
                  : activeVariant === 1
                  ? "text-stone-400 hover:text-white"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {variant}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-20 flex flex-col items-center justify-center w-full mx-auto px-6 py-12 md:py-24">
        
        <AnimatePresence mode="wait">
          <motion.h2
            key={activeVariant}
            initial={{ opacity: 0, y: 15, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -15, filter: 'blur(10px)' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} 
            className={`text-5xl md:text-7xl lg:text-[6rem] font-serif font-bold tracking-tighter mb-12 md:mb-20 text-center leading-[0.9] ${
              activeVariant === 1 ? 'text-white' : 'text-stone-900'
            }`}
          >
            Dashboard
          </motion.h2>
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 w-full max-w-5xl place-items-center perspective-[1000px]">
          {CARDS_DATA.map((card, idx) => (
            <GlassCard
              key={`card-${activeVariant}-${idx}`}
              card={card}
              variant={activeVariant}
              index={idx}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GlassCard({ card, variant, index }: { card: any; variant: number; index: number }) {
  const [isHovered, setIsHovered] = useState(false);

  const getVariantStyles = () => {
    switch (variant) {
      case 0:
        return {
          container: "bg-gradient-to-b from-white/40 to-white/10 backdrop-blur-2xl border-white/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] text-stone-900 hover:shadow-[0_40px_80px_-12px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,1)]",
          topLabelContainer: "bg-white/80 text-stone-800 backdrop-blur-md shadow-sm border border-white/60",
          iconColor: "text-stone-800",
        };
      case 1:
        return {
          container: "bg-gradient-to-b from-white/[0.08] to-white/0 backdrop-blur-3xl border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.15)] text-white hover:border-white/20",
          topLabelContainer: "bg-white/10 text-stone-300 backdrop-blur-md border border-white/10",
          iconColor: "text-white/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]",
        };
      case 2:
        return {
          container: "bg-white/20 backdrop-blur-3xl border-white/50 shadow-[0_32px_64px_-12px_rgba(31,38,135,0.15),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_0_20px_rgba(255,255,255,0.5)] text-stone-900 hover:bg-white/[0.25]",
          topLabelContainer: "bg-white/60 text-stone-900 backdrop-blur-md border border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.05)]",
          iconColor: "text-stone-900 drop-shadow-[0_4px_20px_rgba(255,255,255,1)]",
        };
      default:
        return {};
    }
  };

  const styles = getVariantStyles();

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 70,
        damping: 20,
        delay: index * 0.15,
      }}
      whileHover={{ y: -8, scale: 1.02 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={`
        group relative flex flex-col items-center
        w-full aspect-[2.9/4.5] sm:max-w-[320px] rounded-[2.5rem] p-8 md:p-10
        transition-all duration-500 overflow-hidden cursor-pointer
        border border-solid ${styles?.container}
      `}
    >
      <div 
        className={`absolute inset-0 bg-gradient-to-tr from-white/0 via-white/${variant===1 ? '5' : '30'} to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[2.5rem]`} 
      />

      <motion.div 
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 + index * 0.1 }}
        className={`px-5 py-2 rounded-full text-[11px] font-bold tracking-widest uppercase mb-12 ${styles?.topLabelContainer}`}
      >
        {card.label}
      </motion.div>

      <motion.div
        animate={{ 
          y: isHovered ? [0, -8, 0] : [0, -4, 0],
          scale: isHovered ? 1.05 : 1
        }}
        transition={{
          y: { duration: isHovered ? 2 : 4, repeat: Infinity, ease: "easeInOut" },
          scale: { type: "spring", stiffness: 200, damping: 15 }
        }}
        className={`my-auto flex flex-col items-center justify-center ${styles?.iconColor}`}
      >
        {card.icon}
        {variant !== 1 && <div className="mt-8 text-2xl font-light opacity-30">+</div>}
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 + index * 0.1 }}
        className="mt-auto w-full text-center"
      >
        <h3 className="text-[1.2rem] md:text-xl font-medium tracking-tight whitespace-pre-line leading-[1.1] mb-2">
          {card.title}
        </h3>
        
        <motion.div 
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: isHovered ? 1 : 0, width: isHovered ? '40px' : 0 }}
          className={`h-[2px] mx-auto mt-6 ${variant === 1 ? 'bg-white/50' : 'bg-stone-900/30'} flex justify-end`}
        />
      </motion.div>
    </motion.div>
  );
}
