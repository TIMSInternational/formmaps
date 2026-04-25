import { motion } from 'motion/react';

interface StatCardProps {
  title: string;
  subtitle: string;
  icon: string;
  buttonText: string;
  variant?: 'primary' | 'secondary';
}

export function StatCard({ title, subtitle, icon, buttonText, variant = 'primary' }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="text-2xl" aria-hidden="true">{icon}</div>
      </div>
      <button 
        className={`w-full py-2 px-4 rounded text-sm font-medium transition ${
          variant === 'primary' 
            ? 'bg-blue-600 text-white hover:bg-blue-700' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {buttonText}
      </button>
    </motion.div>
  );
}
