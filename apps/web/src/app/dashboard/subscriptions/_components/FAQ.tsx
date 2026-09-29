"use client";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// question/answer = i18n keys (common namespace)
const faqData = [
  {
    id: 1,
    question: "studentUi.subscriptions.faq.q1.question",
    answer:
      "studentUi.subscriptions.faq.q1.answer",
  },
  {
    id: 2,
    question: "studentUi.subscriptions.faq.q2.question",
    answer:
      "studentUi.subscriptions.faq.q2.answer",
  },
  {
    id: 3,
    question: "studentUi.subscriptions.faq.q3.question",
    answer:
      "studentUi.subscriptions.faq.q3.answer",
  },
  {
    id: 4,
    question: "studentUi.subscriptions.faq.q4.question",
    answer:
      "studentUi.subscriptions.faq.q4.answer",
  },

  {
    id: 5,
    question: "studentUi.subscriptions.faq.q5.question",
    answer:
      "studentUi.subscriptions.faq.q5.answer",
  },
];

interface FAQProps {
  className?: string;
}

export function FAQ({ className }: FAQProps) {
  const { t } = useTranslation();
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (id: number) => {
    setOpenItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className={cn("max-w-4xl mx-auto", className)}>
      <div className="text-center mb-8 md:mb-12">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
          {t("studentUi.subscriptions.faq.title")}
        </h2>
        <p className="text-gray-600 text-lg">
          {t("studentUi.subscriptions.faq.subtitle")}
        </p>
      </div>

      <div className="space-y-4">
        {faqData.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <span className="font-semibold text-gray-900 pr-4">
                {t(item.question)}
              </span>
              <motion.div
                animate={{ rotate: openItems.includes(item.id) ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </motion.div>
            </button>

            <AnimatePresence>
              {openItems.includes(item.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-4 text-gray-600 leading-relaxed">
                    {t(item.answer)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Contact Support */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center mt-12 p-8 bg-gradient-to-r from-[var(--admin-accent-blue)]/10 to-purple-50 rounded-2xl border border-[var(--admin-accent-blue)]/20"
      >
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {t("studentUi.subscriptions.faq.stillQuestions")}
        </h3>
        <p className="text-gray-600 mb-4">
          {t("studentUi.subscriptions.faq.supportBody")}
        </p>
        <button className="bg-[var(--admin-accent-blue)] text-white px-6 py-3 rounded-lg font-medium hover:bg-[var(--admin-accent-blue)]/90 transition-colors">
          {t("studentUi.subscriptions.faq.contactSupport")}
        </button>
      </motion.div>
    </div>
  );
}
