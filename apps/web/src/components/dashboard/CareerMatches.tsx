import { motion } from 'motion/react';

const careerMatches = [
  {
    title: 'Sr. Software developer',
    company: 'Creative Design Labs',
    progress: 85,
  },
  {
    title: 'Python Text to speech',
    company: 'Microsoft',
    progress: 70,
  },
  {
    title: 'Database Engineer', 
    company: 'Softwire Inc.',
    progress: 65,
  },
];

export function CareerMatches() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-sm border"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Top 3 Career Match</h3>
      
      <div className="space-y-4">
        {careerMatches.map((match, index) => (
          <motion.div
            key={match.title}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {match.title.charAt(0)}
                </span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{match.title}</h4>
                <p className="text-sm text-gray-500">{match.company}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div 
                className="w-12 h-12 relative" 
                role="progressbar" 
                aria-valuenow={match.progress} 
                aria-valuemin={0} 
                aria-valuemax={100}
                aria-label={`${match.title} match score`}
              >
                <svg className="w-12 h-12 transform -rotate-90" aria-hidden="true">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="transparent"
                    stroke="#e5e7eb"
                    strokeWidth="4"
                  />
                  <motion.circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - match.progress / 100)}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - match.progress / 100) }}
                    transition={{ delay: index * 0.2, duration: 1 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-700">
                    {match.progress}%
                  </span>
                </div>
              </div>
              <button 
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition"
                aria-label={`View details for ${match.title}`}
              >
                <span className="text-gray-600" aria-hidden="true">→</span>
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      
      <button className="text-sm text-blue-600 hover:text-blue-700 mt-4">
        Show more
      </button>
    </motion.div>
  );
}
