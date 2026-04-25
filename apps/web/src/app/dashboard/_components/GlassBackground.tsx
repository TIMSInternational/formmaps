"use client";

import React from "react";
import { motion } from "framer-motion";

export function GlassBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#eff4fb]">
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute top-[10%] left-[15%] w-[60vw] h-[60vw] bg-blue-200/50 rounded-full blur-[120px] mix-blend-multiply opacity-50"
      />
      <motion.div
        animate={{ scale: [1, 1.3, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute top-[20%] right-[10%] w-[50vw] h-[50vw] bg-indigo-200/50 rounded-full blur-[120px] mix-blend-multiply opacity-50"
      />
      <motion.div
        animate={{ scale: [1, 1.1, 1], translateY: [0, 80, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[-10%] left-[30%] w-[70vw] h-[50vw] bg-cyan-200/40 rounded-full blur-[120px] mix-blend-multiply opacity-50"
      />
      
      {/* Heavy noise overlay to give the whole system a raw tactile texture */}
      <div 
        className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      ></div>
    </div>
  );
}
