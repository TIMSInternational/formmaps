"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

export function APITester() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const { t } = useTranslation();

  const addResult = (message: string) => {
    setTestResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testPaymentAPIs = async () => {
    setTesting(true);
    addResult(t('admin.apiTester.messages.startPaymentTests'));

    try {
      // Test Stripe Config
      addResult(t('admin.apiTester.messages.testingStripeConfig'));
      const configResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/config`
      );
      addResult(
        configResponse.ok
          ? t('admin.apiTester.messages.stripeConfigResultSuccess')
          : t('admin.apiTester.messages.stripeConfigResultFailed')
      );

      // Test Create Payment Intent
      addResult(t('admin.apiTester.messages.testingCreatePaymentIntent'));
      const paymentResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/create-payload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            userId: "test-admin-user",
            amount: 2900,
            currency: "usd",
            description: "Admin test payment",
          }),
        }
      );
      addResult(
        paymentResponse.ok
          ? t('admin.apiTester.messages.paymentIntentSuccess')
          : t('admin.apiTester.messages.paymentIntentFailed')
      );

      // Test Subscription Plans API
      addResult(t('admin.apiTester.messages.testingSubscriptionPlans'));
      const plansResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/subscriptionplan`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      addResult(
        plansResponse.ok
          ? t('admin.apiTester.messages.subscriptionPlansSuccess')
          : t('admin.apiTester.messages.subscriptionPlansFailed')
      );

      addResult(t('admin.apiTester.messages.allCompleted'));
    } catch (error: any) {
      addResult(t('admin.apiTester.messages.testFailedWithError', { error: String(error) }));
    } finally {
      setTesting(false);
    }
  }; 

  const testStripeCheckout = async () => {
    setTesting(true);
    addResult(t('admin.apiTester.messages.testingStripeCheckout'));

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            userId: "admin-test-user",
            amount: 2900,
            currency: "usd",
            productName: "Admin Test Plan",
            successUrl: `${window.location.origin}/dashboard/admin?test=success`,
            cancelUrl: `${window.location.origin}/dashboard/admin?test=cancelled`,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        addResult(t('admin.apiTester.messages.checkoutCreatedSuccess'));
        addResult(t('admin.apiTester.messages.checkoutSessionUrl', { url: data.sessionUrl }));
      } else {
        addResult(t('admin.apiTester.messages.checkoutFailed'));
      }
    } catch (error: any) {
      addResult(t('admin.apiTester.messages.checkoutTestFailedError', { error: String(error) }));
    } finally {
      setTesting(false);
    }
  }; 

  const testRoleAPIs = async () => {
    setTesting(true);
    addResult(t('admin.apiTester.messages.roleTestingStart'));

    try {
      const { testRoleAPIs } = await import("@/services/roleService");

      // Capture console.log output
      const originalLog = console.log;
      console.log = (message: string, ...args: any[]) => {
        addResult(`${message} ${args.length > 0 ? JSON.stringify(args) : ""}`);
        originalLog(message, ...args);
      };

      await testRoleAPIs();

      // Restore console.log
      console.log = originalLog;

      addResult(t('admin.apiTester.messages.roleTestingCompleted'));
    } catch (error: any) {
      addResult(t('admin.apiTester.messages.roleTestingFailed', { error: String(error) }));
    } finally {
      setTesting(false);
    }
  };

  const testAuthAPIs = async () => {
    setTesting(true);
    addResult(t('admin.apiTester.messages.authTestingStart'));

    try {
      const { testAuthAPIs } = await import("@/services/authService");

      // Capture console.log output
      const originalLog = console.log;
      console.log = (message: string, ...args: any[]) => {
        addResult(`${message} ${args.length > 0 ? JSON.stringify(args) : ""}`);
        originalLog(message, ...args);
      };

      await testAuthAPIs();

      // Restore console.log
      console.log = originalLog;

      addResult(t('admin.apiTester.messages.authTestingCompleted'));
    } catch (error: any) {
      addResult(t('admin.apiTester.messages.authTestingFailed', { error: String(error) }));
    } finally {
      setTesting(false);
    }
  };



  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('admin.apiTester.title')}</h3>
        <div className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
          {t('admin.apiTester.developmentOnly')}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={testPaymentAPIs}
          disabled={testing}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? t('admin.apiTester.testing') : t('admin.apiTester.testPayment')}
        </button>
        <button
          onClick={testStripeCheckout}
          disabled={testing}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? t('admin.apiTester.testing') : t('admin.apiTester.testStripeCheckout')}
        </button>
        <button
          onClick={testRoleAPIs}
          disabled={testing}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? t('admin.apiTester.testing') : t('admin.apiTester.testRoleAPIs')}
        </button>
        <button
          onClick={testAuthAPIs}
          disabled={testing}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? t('admin.apiTester.testing') : t('admin.apiTester.testAuthAPIs')}
        </button>
        <button
          onClick={clearResults}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition-colors"
        >
          {t('admin.apiTester.clearResults')}
        </button> 
      </div>

      {testResults.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          <h4 className="text-sm font-medium text-gray-900 mb-2">{t('admin.apiTester.testResultsTitle')}</h4>
          <div className="space-y-1">
            {testResults.map((result, index) => (
              <div key={index} className="text-xs font-mono text-gray-700">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
