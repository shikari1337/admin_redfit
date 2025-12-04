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
  measurementKeys?: string[];
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

// Attribute-based variation system (WordPress/WooCommerce style)
export interface AttributeOption {
  _id: string;
  name: string;
  slug: string;
  type: 'text' | 'color' | 'image' | 'select';
  description?: string;
  values?: AttributeValueOption[];
}

export interface AttributeValueOption {
  _id: string;
  name: string;
  slug: string;
  value?: string; // For color attributes, this is the hex code
  imageUrl?: string; // For image attributes
  attributeId: string;
}

export interface ProductVariation {
  id: string; // Temporary ID for frontend
  attributes: Record<string, string>; // { attributeSlug: attributeValueId }
  price?: number;
  originalPrice?: number;
  stock: number;
  sku: string;
  images?: string[];
  shortDescription?: string;
  isActive?: boolean;
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
  stock: number | undefined;
  categories: string[];
  sizeChart: SizeChartEntry[];
  washCareInstructions: Array<{ text: string; iconUrl?: string; iconName?: string }>;
  customerOrderImages: string[];
  disableVariants: boolean;
  showOutOfStockVariants: boolean;
  showFeatures: boolean;
  isActive: boolean;
  // Attribute-based variations
  attributeIds: string[];
  variations: ProductVariation[];
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
