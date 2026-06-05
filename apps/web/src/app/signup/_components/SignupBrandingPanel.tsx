"use client";

import { motion } from "motion/react";

const FEATURES = [
  { icon: "🚀", text: "Build professional resumes in minutes" },
  { icon: "🎯", text: "Get matched with perfect opportunities" },
  { icon: "💼", text: "Access expert career coaching" },
  { icon: "📈", text: "Track your professional growth" },
  { icon: "🤝", text: "Connect with industry mentors" },
];

export function SignupBrandingPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900" />

      {/* Simple decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-32 right-16 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-16 w-48 h-48 bg-purple-400/10 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col justify-center px-12 text-white">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold">F</span>
            </div>
            <span className="text-3xl font-bold">FORMMAPS</span>
          </div>

          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Start your career
            <br />
            <span className="text-purple-300">transformation today</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8 leading-relaxed">
            Join thousands of professionals who&apos;ve accelerated their careers
            with our AI-powered platform.
          </p>

          <div className="space-y-4">
            {FEATURES.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
                className="flex items-center space-x-3"
              >
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-sm">{item.icon}</span>
                </div>
                <span className="text-slate-200">{item.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
