# Product Component Tests

This directory contains unit tests for product form components.

## Test Structure

Each component should have a corresponding test file:
- `ProductPricing.test.tsx` - Tests for ProductPricing component
- `ProductBasicInfo.test.tsx` - Tests for ProductBasicInfo component
- `ProductSizesStock.test.tsx` - Tests for ProductSizesStock component
- etc.

## Testing Patterns

### Basic Component Test

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ComponentName from '../ComponentName';

describe('ComponentName', () => {
  const defaultProps = {
    // Default props
  };

  it('renders correctly', () => {
    render(<ComponentName {...defaultProps} />);
    // Assertions
  });

  it('handles user interactions', () => {
    const onAction = jest.fn();
    render(<ComponentName {...defaultProps} onAction={onAction} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(onAction).toHaveBeenCalled();
  });
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests for specific file
npm test -- ProductPricing.test.tsx

# Run tests with coverage
npm test -- --coverage
```

## Test Coverage Goals

- **Component Rendering**: Test that components render correctly
- **User Interactions**: Test button clicks, input changes, etc.
- **Props Handling**: Test that props are passed and used correctly
- **Error States**: Test error display and validation
- **Edge Cases**: Test empty states, null values, etc.

## Dependencies

Tests use:
- `@testing-library/react` - React component testing utilities
- `@testing-library/jest-dom` - Additional Jest matchers
- `@testing-library/user-event` - User interaction simulation (optional)

