export interface ProductSize {
  size: string;
  stock: number;
  sku: string;
  price: number;
  originalPrice: number;
}

export interface ProductVariant {
  colorName: string;
  colorCode: string;
  price: number;
  originalPrice: number;
  images: string[];
  sizes: ProductSize[];
}

// Shopify-style variant management interfaces
export interface VariantType {
  id: string;
  name: string;
  isColor?: boolean;
}

export interface VariantOption {
  typeId: string;
  typeName: string;
  value: string;
  colorCode?: string;
}

export interface VariantCombination {
  id: string;
  options: VariantOption[];
  sku: string;
  price: number;
  originalPrice: number;
  stock: number;
  image?: string;
  images?: string[];
}

export interface CategoryOption {
  _id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export interface SizeChartEntry {
  size: string;
  chest?: string;
  waist?: string;
  length?: string;
  shoulder?: string;
  sleeve?: string;
  imageUrl?: string;
  [key: string]: string | undefined;
}

export interface SizeChartOption {
  _id: string;
  name: string;
  entries?: SizeChartEntry[];
}

export interface SeoFormState {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  metaRobots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

export interface ProductFormData {
  name: string;
  sku: string;
  price: string;
  originalPrice: string;
  description: string;
  richDescription: string;
  descriptionImage: string;
  images: string[];
  videos: string[];
  sizes: string[];
  stock: Record<string, number>;
  categories: string[];
  sizeChart: SizeChartEntry[];
  washCareInstructions: Array<{ text: string; iconUrl?: string; iconName?: string }>;
  customerOrderImages: string[];
  disableVariants: boolean;
  showOutOfStockVariants: boolean;
  showFeatures: boolean;
  isActive: boolean;
  variants: ProductVariant[];
}

export const SLUG_MAX_LENGTH = 40;
export const META_TITLE_LIMIT = 70;
export const META_DESCRIPTION_LIMIT = 200;

export const emptySizeChartEntry: SizeChartEntry = {
  size: '',
  chest: '',
  waist: '',
  length: '',
  shoulder: '',
  sleeve: '',
  imageUrl: '',
};

