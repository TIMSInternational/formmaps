# Subscription Page

A modern, responsive subscription page with a single subscription offering three billing options (one-time, monthly, yearly), feature comparison, and FAQ sections.

## Features

- **Responsive Design**: Optimized for mobile, tablet, and desktop with responsive sidebar
- **Modern Animations**: Subtle animations using Framer Motion
- **Single Subscription Model**: One subscription with three billing options
- **Feature Comparison**: Detailed comparison table across billing options
- **FAQ**: Expandable FAQ section
- **Loading States**: Ready for API integration
- **Mobile-First**: Responsive sidebar with mobile overlay

## Components

### SubscriptionPlans
Main component that orchestrates all subscription-related sections with:
- Single subscription header
- Three billing option cards
- Feature comparison table
- FAQ section

### FAQ
Expandable FAQ section with smooth animations.

### Testimonials
Customer testimonials with ratings and stats.

### LoadingState & ErrorState
Ready-to-use loading and error states for API integration.

## Data Structure

The subscription data is currently stored in `data.ts` with the following structure:

```typescript
interface BillingOption {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  period: string;
  popular: boolean;
  ctaText: string;
  additionalInfo?: string;
  discount?: number;
  features: string[];
}

interface Subscription {
  name: string;
  description: string;
  icon: string;
  features: string[];
}
```

## API Integration

To integrate with your backend API, replace the dummy data in `data.ts`:

1. **Fetch Subscription Data**: Replace `subscriptionData` with API call
2. **Create Subscription**: Implement `createSubscription` function
3. **Handle Loading**: Use `LoadingState` component
4. **Handle Errors**: Use `ErrorState` component

### Example API Integration

```typescript
// In SubscriptionPlans.tsx
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);

useEffect(() => {
  fetchSubscriptionPlans()
    .then(setSubscriptionData)
    .catch(err => setError(err.message))
    .finally(() => setLoading(false));
}, []);

if (loading) return <LoadingState />;
if (error) return <ErrorState message={error} onRetry={refetch} />;
```

## Styling

The page follows the existing dashboard design system:
- Consistent spacing scales (4px, 8px, 16px, 24px, 32px)
- Color palette matching dashboard theme
- Typography hierarchy
- Shadow and border styles

## Accessibility

- WCAG 2.1 AA compliant
- 44px minimum touch targets
- Proper focus management
- Screen reader friendly
- Keyboard navigation support

## Mobile Responsiveness

- Mobile-first approach
- Responsive grid layouts
- Touch-friendly interactions
- Optimized typography scaling
- Horizontal scrolling for comparison table

## Future Enhancements

1. **Payment Integration**: Stripe/PayPal integration
2. **Plan Comparison**: Side-by-side plan comparison modal
3. **Usage Analytics**: Track user interactions
4. **A/B Testing**: Test different pricing strategies
5. **Localization**: Multi-language support
6. **Currency Support**: Multiple currency options

## Usage

```tsx
import { SubscriptionPlans } from './_components/SubscriptionPlans';

export default function SubscriptionsPage() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <SubscriptionPlans />
        </main>
      </div>
    </div>
  );
}
```
