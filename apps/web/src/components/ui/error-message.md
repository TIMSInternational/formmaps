# Error Message Components

This module provides consistent error message components for the TimCare application, built on top of ShadCN's Alert component.

## Components

### ErrorMessage
The base error message component with customizable variants.

```tsx
import { ErrorMessage } from '@/components/ui/error-message';

<ErrorMessage 
  message="Something went wrong" 
  title="Error" 
  variant="error" 
  showIcon={true} 
/>
```

**Props:**
- `message` (string): The error message to display
- `title` (string, optional): Title for the error message
- `variant` ('error' | 'warning' | 'info'): Visual style variant
- `className` (string, optional): Additional CSS classes
- `showIcon` (boolean, default: true): Whether to show the icon

### AuthErrorMessage
Specialized component for authentication errors.

```tsx
import { AuthErrorMessage } from '@/components/ui/error-message';

<AuthErrorMessage message="Invalid credentials" />
```

### ValidationErrorMessage
For form validation errors.

```tsx
import { ValidationErrorMessage } from '@/components/ui/error-message';

<ValidationErrorMessage message="Please fill in all required fields" />
```

### InfoMessage
For informational messages.

```tsx
import { InfoMessage } from '@/components/ui/error-message';

<InfoMessage 
  message="Your changes have been saved" 
  title="Success" 
/>
```

## Design System Consistency

These components ensure consistent styling across the application:

- **Error**: Red color scheme with XCircle icon
- **Warning**: Yellow color scheme with AlertTriangle icon  
- **Info**: Blue color scheme with Info icon

All components use the application's design tokens and are fully accessible with proper ARIA attributes.

## Migration

When updating existing error messages, replace custom div-based error displays with these components:

```tsx
// Before
<div className="p-3 bg-red-50 border border-red-200 rounded-lg">
  <p className="text-sm text-red-600 font-medium">
    {errorMessage}
  </p>
</div>

// After
<AuthErrorMessage message={errorMessage} />
```