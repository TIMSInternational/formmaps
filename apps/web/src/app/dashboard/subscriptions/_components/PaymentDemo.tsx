"use client";
import { useState } from 'react';
import { motion } from 'motion/react';
import { Play, CheckCircle, AlertCircle, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentDemoProps {
  className?: string;
}

export function PaymentDemo({ className }: PaymentDemoProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<Array<{ step: string; status: 'success' | 'error' | 'pending'; message: string }>>([]);

  const demoSteps = [
    { name: 'Get Stripe Config', description: 'Fetching Stripe configuration' },
    { name: 'Create Payment Intent', description: 'Creating payment intent for monthly subscription' },
    { name: 'Process Payment', description: 'Processing payment with mock card' },
    { name: 'Create Subscription', description: 'Creating subscription record' },
    { name: 'Update UI', description: 'Updating subscription status' }
  ];

  const runDemo = async () => {
    setIsRunning(true);
    setCurrentStep(0);
    setResults([]);

    try {
      // Import test utilities
      const { testMockPaymentFlow } = await import('@/utils/testPaymentAPI');

      for (let i = 0; i < demoSteps.length; i++) {
        setCurrentStep(i);
        
        // Add result for current step
        setResults(prev => [...prev, {
          step: demoSteps[i].name,
          status: 'pending',
          message: demoSteps[i].description
        }]);

        // Simulate step processing
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        // Update result based on step
        let success = true;
        let message = '';

        switch (i) {
          case 0:
            message = 'Stripe configuration retrieved successfully';
            break;
          case 1:
            message = 'Payment intent created: pi_demo_123456';
            break;
          case 2:
            message = 'Payment processed successfully with card ****4242';
            break;
          case 3:
            message = 'Subscription created with ID: sub_demo_789';
            break;
          case 4:
            message = 'UI updated with new subscription status';
            break;
        }

        // Simulate occasional errors for demo purposes
        if (Math.random() < 0.1) {
          success = false;
          message = `Error in ${demoSteps[i].name}: Simulated error for demo`;
        }

        setResults(prev => prev.map((result, index) => 
          index === i 
            ? { ...result, status: success ? 'success' : 'error', message }
            : result
        ));
      }

      // Run actual test if all steps succeeded
      if (results.every(r => r.status === 'success')) {
        console.log('Running actual payment flow test...');
        await testMockPaymentFlow('monthly');
      }

    } catch (error) {
      console.error('Demo failed:', error);
      setResults(prev => [...prev, {
        step: 'Demo Error',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }]);
    } finally {
      setIsRunning(false);
      setCurrentStep(demoSteps.length);
    }
  };

  return (
    <div className={cn("bg-white rounded-2xl border border-gray-200 p-6", className)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Flow Demo</h3>
          <p className="text-sm text-gray-600">Test the complete payment integration</p>
        </div>
        <button
          onClick={runDemo}
          disabled={isRunning}
          className={cn(
            "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
            isRunning
              ? "bg-gray-100 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <Play className="w-4 h-4" />
          <span>{isRunning ? 'Running...' : 'Run Demo'}</span>
        </button>
      </div>

      {/* Progress Steps */}
      <div className="space-y-4">
        {demoSteps.map((step, index) => {
          const result = results[index];
          const isActive = currentStep === index && isRunning;
          const isCompleted = result && result.status !== 'pending';
          
          return (
            <motion.div
              key={step.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-start space-x-3 p-3 rounded-lg border",
                isActive ? "border-blue-200 bg-blue-50" : "border-gray-200",
                isCompleted && result.status === 'success' ? "border-green-200 bg-green-50" : "",
                isCompleted && result.status === 'error' ? "border-red-200 bg-red-50" : ""
              )}
            >
              {/* Step Icon */}
              <div className={cn(
                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium",
                isActive ? "bg-blue-600 text-white" : "",
                isCompleted && result.status === 'success' ? "bg-green-600 text-white" : "",
                isCompleted && result.status === 'error' ? "bg-red-600 text-white" : "",
                !isActive && !isCompleted ? "bg-gray-200 text-gray-600" : ""
              )}>
                {isCompleted && result.status === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isCompleted && result.status === 'error' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : isActive ? (
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                ) : (
                  index + 1
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className={cn(
                    "font-medium",
                    isActive ? "text-blue-900" : "",
                    isCompleted && result.status === 'success' ? "text-green-900" : "",
                    isCompleted && result.status === 'error' ? "text-red-900" : "",
                    !isActive && !isCompleted ? "text-gray-700" : ""
                  )}>
                    {step.name}
                  </h4>
                  {isActive && (
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
                <p className={cn(
                  "text-sm mt-1",
                  isActive ? "text-blue-700" : "",
                  isCompleted && result.status === 'success' ? "text-green-700" : "",
                  isCompleted && result.status === 'error' ? "text-red-700" : "",
                  !isActive && !isCompleted ? "text-gray-500" : ""
                )}>
                  {result ? result.message : step.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Demo Results Summary */}
      {results.length > 0 && !isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 rounded-lg border border-gray-200 bg-gray-50"
        >
          <div className="flex items-center space-x-2 mb-2">
            <CreditCard className="w-5 h-5 text-gray-600" />
            <h4 className="font-medium text-gray-900">Demo Summary</h4>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">
                {results.filter(r => r.status === 'success').length}
              </div>
              <div className="text-gray-600">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600">
                {results.filter(r => r.status === 'error').length}
              </div>
              <div className="text-gray-600">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-600">
                {results.length}
              </div>
              <div className="text-gray-600">Total Steps</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
