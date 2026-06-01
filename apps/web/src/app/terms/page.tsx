import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "FormMaps terms of service — rules and conditions for using our platform.",
};

export default function TermsOfServicePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: May 26, 2026</p>

      <div className="prose prose-sm dark:prose-invert space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using the FormMaps platform (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you are using the Service on behalf of a school or organization, you represent that you have authority to bind that entity to these terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">2. Description of Service</h2>
          <p>FormMaps provides a career development and assessment platform for students, schools, counselors, coaches, and parents. Features include personality and cognitive assessments, career matching, university recommendations, course planning, resume building, and AI-powered insights.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">3. User Accounts</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You are responsible for maintaining the security of your account credentials</li>
            <li>You must notify us immediately of any unauthorized access to your account</li>
            <li>One person may not maintain more than one account of the same role type</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">4. Subscriptions and Payments</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Individual students may access premium features through paid subscriptions</li>
            <li>School-affiliated students receive access through their school&apos;s subscription</li>
            <li>Payments are processed securely through Stripe</li>
            <li>Subscriptions auto-renew unless cancelled before the billing date</li>
            <li>Refunds are handled on a case-by-case basis within 14 days of purchase</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to other users&apos; accounts or data</li>
            <li>Submit false or misleading assessment responses</li>
            <li>Use automated tools to scrape or collect data from the platform</li>
            <li>Interfere with or disrupt the Service&apos;s infrastructure</li>
            <li>Share your account credentials with others</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">6. Intellectual Property</h2>
          <p>The Service, including all content, features, and functionality, is owned by FormMaps and protected by copyright, trademark, and other intellectual property laws. Assessment content, scoring algorithms, and AI-generated insights are proprietary.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">7. Disclaimers</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Career recommendations and university matches are suggestions based on assessment data, not guarantees of admission or employment</li>
            <li>AI-generated insights are for informational purposes and should not replace professional counseling</li>
            <li>The Service is provided &quot;as is&quot; without warranties of any kind</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">8. Limitation of Liability</h2>
          <p>FormMaps shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to loss of data, career opportunities, or academic decisions made based on our recommendations.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">9. Termination</h2>
          <p>We may terminate or suspend your account at any time for violation of these Terms. You may delete your account at any time through your profile settings. Upon termination, your right to use the Service ceases immediately.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">10. Changes to Terms</h2>
          <p>We may update these Terms from time to time. We will notify you of material changes via email or platform notification. Continued use after changes constitutes acceptance.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">11. Contact</h2>
          <p>Questions about these Terms? Contact us at <a href="mailto:legal@formmaps.ai" className="text-blue-600 underline">legal@formmaps.ai</a>.</p>
        </section>
      </div>
    </main>
  );
}
