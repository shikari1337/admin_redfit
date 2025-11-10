import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductPricing from '../ProductPricing';

describe('ProductPricing', () => {
  const defaultProps = {
    price: '100',
    originalPrice: '150',
    onPriceChange: jest.fn(),
    onOriginalPriceChange: jest.fn(),
    errors: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders price and original price inputs', () => {
    render(<ProductPricing {...defaultProps} />);
    
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/original price/i)).toBeInTheDocument();
  });

  it('displays current price and original price values', () => {
    render(<ProductPricing {...defaultProps} />);
    
    const priceInput = screen.getByLabelText(/price/i) as HTMLInputElement;
    const originalPriceInput = screen.getByLabelText(/original price/i) as HTMLInputElement;
    
    expect(priceInput.value).toBe('100');
    expect(originalPriceInput.value).toBe('150');
  });

  it('calls onPriceChange when price input changes', () => {
    const onPriceChange = jest.fn();
    render(<ProductPricing {...defaultProps} onPriceChange={onPriceChange} />);
    
    const priceInput = screen.getByLabelText(/price/i);
    fireEvent.change(priceInput, { target: { value: '200' } });
    
    expect(onPriceChange).toHaveBeenCalledWith('200');
  });

  it('calls onOriginalPriceChange when original price input changes', () => {
    const onOriginalPriceChange = jest.fn();
    render(<ProductPricing {...defaultProps} onOriginalPriceChange={onOriginalPriceChange} />);
    
    const originalPriceInput = screen.getByLabelText(/original price/i);
    fireEvent.change(originalPriceInput, { target: { value: '250' } });
    
    expect(onOriginalPriceChange).toHaveBeenCalledWith('250');
  });

  it('displays price error when provided', () => {
    const errors = { price: 'Price is required' };
    render(<ProductPricing {...defaultProps} errors={errors} />);
    
    expect(screen.getByText('Price is required')).toBeInTheDocument();
  });

  it('displays original price error when provided', () => {
    const errors = { originalPrice: 'Original price is required' };
    render(<ProductPricing {...defaultProps} errors={errors} />);
    
    expect(screen.getByText('Original price is required')).toBeInTheDocument();
  });

  it('applies error styling to price input when error exists', () => {
    const errors = { price: 'Price is required' };
    render(<ProductPricing {...defaultProps} errors={errors} />);
    
    const priceInput = screen.getByLabelText(/price/i);
    expect(priceInput).toHaveClass('border-red-500');
  });

  it('applies error styling to original price input when error exists', () => {
    const errors = { originalPrice: 'Original price is required' };
    render(<ProductPricing {...defaultProps} errors={errors} />);
    
    const originalPriceInput = screen.getByLabelText(/original price/i);
    expect(originalPriceInput).toHaveClass('border-red-500');
  });
});

