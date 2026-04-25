"use client";
import { useState } from "react";

interface StripeTestButtonProps {
  className?: string;
}

export default function StripeTestButton({
  className = "",
}: StripeTestButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const testCheckoutSession = async () => {
    setTesting(true);
    setResult(null);

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
            userId: "test-user-123",
            amount: 2900, // $29.00
            currency: "usd",
            productName: "Test Monthly Subscription",
            successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}/payment-cancelled`,
          }),
        }
      );


      if (response.ok) {
        const data = await response.json();

        if (data.sessionUrl) {
          setResult(`✅ SUCCESS! Session created: ${data.sessionId}`);

          // Ask user if they want to test the actual payment flow
          const testPayment = confirm(
            `✅ Checkout session created successfully!\n\nSession ID: ${data.sessionId}\n\nWould you like to test the actual payment flow? (You'll be redirected to Stripe)`
          );

          if (testPayment) {
            window.location.href = data.sessionUrl;
          }
        } else {
          setResult(
            `⚠️ Session created but no URL returned: ${JSON.stringify(data)}`
          );
        }
      } else {
        const errorText = await response.text();
        setResult(`❌ API Error (${response.status}): ${errorText}`);
      }
    } catch (error) {
      setResult(
        `💥 Test failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setTesting(false);
    }
  };

  const testExistingAPI = async () => {
    setTesting(true);
    setResult(null);

    try {

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/create-payload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            userId: "test-user-123",
            amount: 2900,
            currency: "usd",
            description: "Test payment for existing API",
          }),
        }
      );


      if (response.ok) {
        const data = await response.json();
        setResult(
          `✅ Existing API works! Payment Intent: ${
            data.paymentIntentId || data.clientSecret || "Created"
          }`
        );
      } else {
        const errorText = await response.text();
        setResult(`❌ Existing API Error (${response.status}): ${errorText}`);
      }
    } catch (error) {
      setResult(
        `💥 Existing API test failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${className}`}
    >
      <h3 className="font-semibold text-yellow-800 mb-3">
        🧪 Stripe API Testing (Development Only)
      </h3>

      <div className="space-y-3">
        <div className="flex space-x-2">
          <button
            onClick={testCheckoutSession}
            disabled={testing}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {testing ? "Testing..." : "Test New Checkout Session API"}
          </button>

          <button
            onClick={testExistingAPI}
            disabled={testing}
            className="bg-green-500 text-white px-4 py-2 rounded text-sm hover:bg-green-600 disabled:bg-gray-400 transition-colors"
          >
            {testing ? "Testing..." : "Test Existing Payment API"}
          </button>
        </div>

        {result && (
          <div className="bg-white border rounded p-3 text-sm font-mono whitespace-pre-wrap">
            {result}
          </div>
        )}

        <div className="text-xs text-yellow-700">
          <p>
            <strong>New API:</strong> Tests the checkout session endpoint (what
            we need)
          </p>
          <p>
            <strong>Existing API:</strong> Tests the current payment intent
            endpoint
          </p>
        </div>
      </div>
    </div>
  );
}
