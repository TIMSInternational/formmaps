import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FormMaps privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: May 26, 2026</p>

      <div className="prose prose-sm dark:prose-invert space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">1. Information We Collect</h2>
          <p>We collect information you provide directly when creating an account, completing assessments, or using our platform:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account information:</strong> name, email address, school affiliation, grade level, role</li>
            <li><strong>Assessment data:</strong> responses to personality (DISC/PCA), cognitive (MIL/LIA), and 360-degree evaluations</li>
            <li><strong>Academic data:</strong> transcripts, test scores, GPA, course plans</li>
            <li><strong>Career exploration:</strong> career interests, university preferences, resume content</li>
            <li><strong>Usage data:</strong> pages visited, features used, session duration</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Deliver personalized career guidance, university recommendations, and course suggestions</li>
            <li>Generate AI-powered insights based on your assessment results</li>
            <li>Enable school administrators and counselors to support your development</li>
            <li>Process payments for subscription services</li>
            <li>Send transactional emails (invitations, reminders, password resets)</li>
            <li>Improve our platform through anonymized analytics</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">3. Data Sharing</h2>
          <p>We do not sell your personal information. We share data only with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Your school:</strong> administrators and counselors at your affiliated school can view your assessment results and academic progress</li>
            <li><strong>Service providers:</strong> AWS (hosting, AI), Stripe (payments), Amazon SES (email)</li>
            <li><strong>360 evaluators:</strong> parents, teachers, and peers you invite to provide feedback</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">4. Data Security</h2>
          <p>We protect your data using:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Encrypted connections (HTTPS/TLS) for all data in transit</li>
            <li>Bcrypt password hashing (12 rounds)</li>
            <li>HttpOnly secure cookies for authentication tokens</li>
            <li>Role-based access controls with permission validation</li>
            <li>Rate limiting to prevent abuse</li>
            <li>Automated database backups with 14-day retention</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">5. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access your personal data through your profile and dashboard</li>
            <li>Correct inaccurate information in your profile settings</li>
            <li>Request deletion of your account and associated data</li>
            <li>Export your assessment results and reports</li>
            <li>Opt out of non-essential communications</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">6. Cookies</h2>
          <p>We use essential cookies for authentication (httpOnly secure cookies) and a non-httpOnly login status cookie. We do not use advertising or tracking cookies.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">7. Children&apos;s Privacy</h2>
          <p>Our platform is designed for use by students in grades 9-12. Students under 13 may only use the platform through their school with parental consent. We comply with applicable children&apos;s privacy regulations including COPPA.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">8. Contact</h2>
          <p>For privacy-related inquiries, contact us at <a href="mailto:privacy@formmaps.ai" className="text-[#2E9098] underline">privacy@formmaps.ai</a>.</p>
        </section>
      </div>
    </main>
  );
}
