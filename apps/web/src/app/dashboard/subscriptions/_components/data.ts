// This file is deprecated - subscription data is now handled by subscriptionService.ts
// Keeping for backward compatibility during migration

import type { SubscriptionData } from '@/services/subscriptionService';

// Legacy export for backward compatibility
export const subscriptionData: SubscriptionData = {
  subscription: {
    name: 'UNIV.365 Premium',
    description: 'Complete access to accelerate your career journey',
    icon: '🎓',
    features: [
      'Complete Platform Access',
      'Advanced Career Analytics',
      'Priority Support',
      'Career Mentorship Program',
      'Unlimited Skill Assessments',
      'Advanced Job Matching Algorithm',
      'Resume Builder Pro',
      'Interview Preparation Tools',
      'Resource Library Access',
      'Community & Networking'
    ]
  },
  billingOptions: [
    {
      id: 'one-time',
      name: 'One-Time Payment',
      description: 'Download PDF Document, limited information',
      price: 15,
      period: 'one-time',
      popular: false,
      ctaText: 'Buy Now',
      additionalInfo: 'Single purchase',
      features: [
        'Download PDF Document',
        'Limited Information Access',
        'Basic Career Guidance',
        'Email Support'
      ]
    },
    {
      id: 'monthly',
      name: 'Monthly Subscription',
      description: 'Complete access to the platform',
      price: 29,
      period: 'month',
      popular: true,
      ctaText: 'Start Monthly',
      additionalInfo: '7-day free trial',
      features: [
        'Everything in One-Time',
        'Complete Platform Access',
        'Advanced Analytics',
        'Priority Support',
        'Career Mentorship',
        'Skill Assessments',
        'Job Matching Algorithm',
        'Resume Builder Pro',
        'Interview Preparation'
      ]
    },
    {
      id: 'yearly',
      name: 'Yearly Subscription',
      description: 'Complete access with significant savings',
      price: 279,
      originalPrice: 348,
      period: 'year',
      popular: false,
      ctaText: 'Start Yearly',
      additionalInfo: 'Save $69 per year',
      discount: 20,
      features: [
        'Everything in Monthly',
        'Priority Customer Support',
        'Advanced Reporting',
        'Early Access to New Features',
        'Dedicated Account Manager',
        'Custom Training Sessions'
      ]
    }
  ],
  features: [
    {
      name: 'PDF Downloads',
      availability: {
        'one-time': true,
        'monthly': true,
        'yearly': true
      }
    },
    {
      name: 'Career Analytics',
      availability: {
        'one-time': false,
        'monthly': true,
        'yearly': true
      }
    },
    {
      name: 'Priority Support',
      availability: {
        'one-time': false,
        'monthly': true,
        'yearly': true
      }
    },
    {
      name: 'Mentorship Program',
      availability: {
        'one-time': false,
        'monthly': true,
        'yearly': true
      }
    },
    {
      name: 'Advanced Reporting',
      availability: {
        'one-time': false,
        'monthly': false,
        'yearly': true
      }
    },
    {
      name: 'Early Access Features',
      availability: {
        'one-time': false,
        'monthly': false,
        'yearly': true
      }
    },
    {
      name: 'Dedicated Account Manager',
      availability: {
        'one-time': false,
        'monthly': false,
        'yearly': true
      }
    },
    {
      name: 'Skill Assessments',
      availability: {
        'one-time': 'Limited',
        'monthly': 'Unlimited',
        'yearly': 'Unlimited'
      }
    },
    {
      name: 'Job Matching',
      availability: {
        'one-time': 'Basic',
        'monthly': 'Advanced',
        'yearly': 'Advanced'
      }
    },
    {
      name: 'Resume Templates',
      availability: {
        'one-time': '3 templates',
        'monthly': '50+ templates',
        'yearly': '50+ templates'
      }
    }
  ]
};

// Legacy interfaces - now defined in subscriptionService.ts
export type { SubscriptionPlan as BillingOption, FeatureComparison, SubscriptionData } from '@/services/subscriptionService';

// Legacy functions - now handled by subscriptionService.ts
export { fetchSubscriptionPlans } from '@/services/subscriptionService';

export async function createSubscription(billingOptionId: string) {
  console.log('Legacy createSubscription called:', { billingOptionId });
  console.warn('This function is deprecated. Use subscriptionService.createSubscription instead.');
}
