import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productsAPI, categoriesAPI, brandsAPI, attributesAPI, attributeValuesAPI } from '../services/api';
import { FaPlus, FaTrash, FaCog, FaCopy } from 'react-icons/fa';
import { Pencil, Download, Upload, Loader2, ChevronDown, Search, X, FileSpreadsheet, PackageSearch } from 'lucide-react';
import { fmtRupees } from '../lib/money';
import {
  Page, PageHeader, Pagination, EmptyState,
  FilterChips, ColumnChooser, useColumnChoice, TableSkeleton,
  type ChipGroup, type ColumnDef,
} from '@/components/erp';
import InfoTip from '@/components/common/InfoTip';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Export/Import mode types
export type ExportMode = 'all_variations' | 'sections';
export type ImportMode = 'all_variations' | 'sections';

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) { inQuotes = true; }
      else if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"' && inQuotes) { inQuotes = false; }
      else if (ch === ',' && !inQuotes) { cells.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
      else { current += ch; }
    }
    cells.push(current.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

// ─── WooCommerce-style CSV ────────────────────────────────────────────────────

const WOO_BASE_COLS = [
  'post_type', 'product_id', 'post_parent', 'variation_id',
  'name', 'slug', 'sku', 'price', 'originalPrice', 'stock', 'isActive', 'productType',
  'description', 'richDescription', 'descriptionImage',
  'parent_categories', 'subcategories', 'featured_category', 'brand', 'tags', 'images', 'videos',
  'hsnCode', 'taxRuleId', 'weight', 'length', 'breadth', 'height',
  'faq_group_id',
];

function resolveBrandName(brand: any, brandIdToName: Map<string, string>): string {
  if (!brand) return '';
  if (typeof brand === 'object' && brand !== null) return brand.name || brand.slug || '';
  if (typeof brand === 'string') {
    if (/^[0-9a-fA-F]{24}$/.test(brand)) return brandIdToName.get(brand) || '';
    return brand;
  }
  return '';
}

function resolveAttrValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return value.name || value.label || value.value || value.title || '';
  return '';
}

function productsToWooCSV(products: any[], brandIdToName: Map<string, string> = new Map()): string {
  // Determine max attribute columns and FAQ items across all products
  let maxAttr = 1;
  let maxFaq = 0;
  products.forEach((p) => {
    (p.variations || []).forEach((v: any) => {
      if (v.attributes && typeof v.attributes === 'object') {
        maxAttr = Math.max(maxAttr, Object.keys(v.attributes).length);
      }
    });
    const ps = (p.pageSections || []).find((s: any) => s.sectionId === 'faq');
    const faqItems = ps?.customData?.items || [];
    maxFaq = Math.max(maxFaq, faqItems.length);
  });

  const attrHeaders: string[] = [];
  for (let i = 1; i <= maxAttr; i++) attrHeaders.push(`attribute${i}_name`, `attribute${i}_value`);
  const faqHeaders: string[] = [];
  for (let i = 1; i <= maxFaq; i++) faqHeaders.push(`faq_question${i}`, `faq_answer${i}`);
  const headers = [...WOO_BASE_COLS, ...faqHeaders, ...attrHeaders];

  const csvRows: string[] = [headers.join(',')];

  products.forEach((p) => {
    const ps = (p.pageSections || []).find((s: any) => s.sectionId === 'faq');
    const faqItems: any[] = ps?.customData?.items || [];
    const parentSku = p.sku ?? '';

    const faqCells = faqHeaders.map((h) => {
      const idx = parseInt(h.replace(/\D/g, ''), 10) - 1;
      if (h.startsWith('faq_question')) return escapeCsvCell(faqItems[idx]?.question || '');
      return escapeCsvCell(faqItems[idx]?.answer || '');
    });

    // product_id = client's own custom/offline ID (not MongoDB _id)
    // post_parent = empty for product rows
    // variation_id = empty for product rows
    const productCells: Record<string, string> = {
      post_type: 'product',
      product_id: p.productId ?? '',
      post_parent: '',
      variation_id: '',
      name: p.name ?? '',
      slug: p.slug ?? '',
      sku: parentSku,
      price: String(p.price ?? ''),
      originalPrice: String(p.originalPrice ?? ''),
      stock: String(p.stock ?? ''),
      isActive: p.isActive !== false ? 'true' : 'false',
      productType: p.productType ?? 'single',
      description: p.description ?? '',
      richDescription: p.richDescription ?? '',
      descriptionImage: p.descriptionImage ?? '',
      parent_categories: (p.categories || []).filter((c: any) => !c.parent).map((c: any) => c?.name ?? c?.slug ?? String(c)).filter(Boolean).join('|'),
      subcategories: (p.categories || []).filter((c: any) => !!c.parent).map((c: any) => c?.name ?? c?.slug ?? String(c)).filter(Boolean).join('|'),
      featured_category: (() => { const fc = p.featuredCategory ? String(p.featuredCategory) : null; const cat = fc ? (p.categories || []).find((c: any) => String(c._id) === fc) : null; return cat?.name ?? cat?.slug ?? ''; })(),
      brand: resolveBrandName(p.brand, brandIdToName),
      tags: (p.tags || []).map((t: any) => t?.name ?? t).filter(Boolean).join('|'),
      images: (p.images || []).join('|'),
      videos: (p.videos || []).join('|'),
      hsnCode: p.hsnCode ?? '',
      taxRuleId: p.taxRuleId ?? '',
      weight: String(p.weight ?? ''),
      length: String(p.length ?? ''),
      breadth: String(p.breadth ?? ''),
      height: String(p.height ?? ''),
      faq_group_id: p.faqGroupId ? String(p.faqGroupId) : '',
    };

    const emptyAttrCells = attrHeaders.map(() => '');
    csvRows.push(headers.map((h) => {
      if (WOO_BASE_COLS.includes(h)) return escapeCsvCell(productCells[h] ?? '');
      const fi = faqHeaders.indexOf(h);
      if (fi >= 0) return faqCells[fi];
      const ai = attrHeaders.indexOf(h);
      return ai >= 0 ? emptyAttrCells[ai] : '';
    }).join(','));

    (p.variations || []).forEach((v: any) => {
      const attrs = v.attributes && typeof v.attributes === 'object' ? Object.entries(v.attributes) : [];
      const varAttrCells = attrHeaders.map((h) => {
        const i = parseInt(h.replace(/\D/g, ''), 10) - 1;
        const [name, value] = attrs[i] || ['', ''];
        // attr name is always a string key; attr value may be an object — extract .name
        return escapeCsvCell(h.endsWith('_name') ? String(name) : resolveAttrValue(value));
      });

      // product_id = variation's own client custom ID (optional)
      // post_parent = parent product's SKU (unique key linkage)
      // variation_id = variation's own SKU (unique key)
      const varCells: Record<string, string> = {
        post_type: 'variation',
        product_id: v.productId ?? '',
        post_parent: parentSku,
        variation_id: v.sku ?? '',
        name: '', slug: '', sku: v.sku ?? '',
        price: v.price != null ? String(v.price) : '',
        originalPrice: v.originalPrice != null ? String(v.originalPrice) : '',
        stock: String(v.stock ?? ''),
        isActive: v.isActive !== false ? 'true' : 'false',
        productType: 'variation',
        description: '', richDescription: '', descriptionImage: '',
        parent_categories: '', subcategories: '', featured_category: '',
        brand: resolveBrandName(v.brand, brandIdToName),
        tags: '', images: (v.images || []).join('|'), videos: '',
        hsnCode: '', taxRuleId: '',
        weight: '', length: '', breadth: '', height: '',
        faq_group_id: v.faqGroupId ? String(v.faqGroupId) : '',
      };

      csvRows.push(headers.map((h) => {
        if (WOO_BASE_COLS.includes(h)) return escapeCsvCell(varCells[h] ?? '');
        if (faqHeaders.includes(h)) return '';
        const ai = attrHeaders.indexOf(h);
        return ai >= 0 ? varAttrCells[ai] : '';
      }).join(','));
    });
  });

  return csvRows.join('\n');
}

function wooRowsToProducts(
  rows: Record<string, string>[],
  lookups: {
    categories: { _id: string; name: string; slug: string }[];
    brands: { _id: string; name: string; slug: string }[];
  }
): any[] {
  const products: any[] = [];
  const productMap = new Map<string, any>();
  let lastProduct: any = null;
  let autoKeyCounter = 0;

  const findCategory = (nameOrSlug: string) => {
    const n = nameOrSlug.toLowerCase().trim();
    return lookups.categories.find((c) => c.name.toLowerCase() === n || c.slug.toLowerCase() === n);
  };
  const findBrand = (nameOrSlug: string) => {
    const n = nameOrSlug.toLowerCase();
    return lookups.brands.find((b) => b.name.toLowerCase() === n || b.slug.toLowerCase() === n);
  };

  const parseCatIds = (row: Record<string, string>) => {
    // Support both pipe-separated and ">" path formats
    const catPaths = (row.category_paths || '').split('|').filter(Boolean);
    const names: string[] = [];
    for (const path of catPaths) {
      // "Parent > Child" → take each segment
      path.split('>').forEach(s => { const t = s.trim(); if (t) names.push(t); });
    }
    // Also support legacy split columns
    (row.parent_categories || row.categories || '').split('|').forEach(s => { const t = s.trim(); if (t) names.push(t); });
    (row.subcategories || '').split('|').forEach(s => { const t = s.trim(); if (t) names.push(t); });
    // Deduplicate
    const seen = new Set<string>();
    const unique = names.filter(n => { if (seen.has(n.toLowerCase())) return false; seen.add(n.toLowerCase()); return true; });
    return unique.map((n) => findCategory(n)?._id).filter(Boolean);
  };

  const parseFaqsJson = (raw: string): { question: string; answer: string; order: number }[] => {
    if (!raw?.trim()) return [];
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map((item: any, i: number) => ({ question: item.question || '', answer: item.answer || '', order: i }));
      }
    } catch {}
    return [];
  };

  for (const row of rows) {
    const postType = (row.post_type || 'product').toLowerCase();

    if (postType === 'product') {
      let sku = row.sku?.trim() || '';
      // Positional grouping: blank SKU is valid — use internal auto-key
      const internalKey = sku || `__pos_${++autoKeyCounter}`;

      const catIds = parseCatIds(row);
      const featuredCatName = (row.featured_category || '').trim();
      const featuredCatId = featuredCatName ? findCategory(featuredCatName)?._id : undefined;
      const brandMatch = row.brand?.trim() ? findBrand(row.brand.trim()) : null;

      const faqItems: { question: string; answer: string; order: number }[] = [];
      // Legacy faq_question1/faq_answer1 columns
      let fi = 1;
      while (row[`faq_question${fi}`] !== undefined || row[`faq_answer${fi}`] !== undefined) {
        const q = row[`faq_question${fi}`]?.trim() || '';
        const a = row[`faq_answer${fi}`]?.trim() || '';
        if (q || a) faqItems.push({ question: q, answer: a, order: fi - 1 });
        fi++;
      }
      // section_faqs_items column (JSON)
      if (!faqItems.length) faqItems.push(...parseFaqsJson(row.section_faqs_items || ''));

      const product: any = {
        productId: row.product_id?.trim() || undefined,
        name: row.name || '',
        slug: row.slug || undefined,
        sku: sku || undefined,
        price: parseFloat(row.price) || 0,
        originalPrice: parseFloat(row.originalPrice) || 0,
        stock: row.stock !== '' ? parseInt(row.stock, 10) : undefined,
        isActive: (row.isActive || 'true').toLowerCase() !== 'false',
        productType: row.productType || 'single',
        description: row.description || row.section_description_content || undefined,
        richDescription: row.richDescription || undefined,
        descriptionImage: row.descriptionImage || undefined,
        dosage: row.section_dosage_content || undefined,
        importantInfo: row['section_important-info_content'] || undefined,
        categories: catIds,
        featuredCategory: featuredCatId || undefined,
        brand: brandMatch?._id || undefined,
        tags: (row.tags || '').split('|').filter(Boolean),
        images: (row.images || '').split('|').filter(Boolean),
        videos: (row.videos || '').split('|').filter(Boolean),
        hsnCode: row.hsnCode || undefined,
        taxRuleId: row.taxRuleId || undefined,
        weight: row.weight ? parseFloat(row.weight) : undefined,
        length: row.length ? parseFloat(row.length) : undefined,
        breadth: row.breadth ? parseFloat(row.breadth) : undefined,
        height: row.height ? parseFloat(row.height) : undefined,
        faqGroupId: row.faq_group_id || undefined,
        variations: [],
      };

      if (faqItems.length > 0) {
        product.pageSections = [{ sectionId: 'faq', enabled: true, order: 0, customData: { items: faqItems } }];
      }

      productMap.set(internalKey, product);
      products.push(product);
      lastProduct = product;

    } else if (postType === 'variation') {
      // SKU-based parent lookup first; fall back to positional (lastProduct)
      const parentSku = (row.post_parent || '').trim();
      const parent = parentSku ? (productMap.get(parentSku) ?? lastProduct) : lastProduct;
      if (!parent) continue;

      const attributes: Record<string, string> = {};
      let ai = 1;
      while (row[`attribute${ai}_name`] !== undefined) {
        const attrName = row[`attribute${ai}_name`]?.trim();
        const attrValue = row[`attribute${ai}_value`]?.trim() || '';
        if (attrName) attributes[attrName] = attrValue;
        ai++;
      }

      const varBrandMatch = row.brand?.trim() ? findBrand(row.brand.trim()) : null;
      const varSku = row.sku?.trim() || row.variation_id?.trim() || '';
      const varCatIds = parseCatIds(row);
      const varFeaturedCatName = (row.featured_category || '').trim();
      const varFeaturedCatId = varFeaturedCatName ? findCategory(varFeaturedCatName)?._id : undefined;

      const varFaqs = parseFaqsJson(row.section_faqs_items || '');

      // First variation carrying description populates parent product if not set
      if (!parent.description && row.section_description_content) {
        parent.description = row.section_description_content;
      }

      parent.variations.push({
        sku: varSku || undefined,
        name: row.name || undefined,
        slug: row.slug || undefined,
        price: row.price ? parseFloat(row.price) : parent.price,
        originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : parent.originalPrice,
        stock: row.stock !== '' ? parseInt(row.stock, 10) : 0,
        isActive: (row.isActive || 'true').toLowerCase() !== 'false',
        images: (row.images || '').split('|').filter(Boolean),
        attributes,
        categories: varCatIds.length ? varCatIds : undefined,
        featuredCategory: varFeaturedCatId || undefined,
        brand: varBrandMatch?._id || undefined,
        description: row.section_description_content || undefined,
        dosage: row.section_dosage_content || undefined,
        importantInfo: row['section_important-info_content'] || undefined,
        faqs: varFaqs.length ? varFaqs : undefined,
        faqGroupId: row.faq_group_id || undefined,
      });
      parent.productType = 'variation';
    }
  }

  return products;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate(): void {
  const headers = [
    'post_type', 'product_id', 'post_parent', 'variation_id',
    'name', 'slug', 'sku', 'price', 'originalPrice', 'stock', 'isActive', 'productType',
    'description', 'richDescription', 'descriptionImage',
    'parent_categories', 'subcategories', 'featured_category', 'brand', 'tags', 'images', 'videos',
    'hsnCode', 'taxRuleId', 'weight', 'length', 'breadth', 'height',
    'faq_group_id', 'faq_question1', 'faq_answer1', 'faq_question2', 'faq_answer2',
    'attribute1_name', 'attribute1_value', 'attribute2_name', 'attribute2_value',
  ];

  const rows = [
    // Simple product — product_id = your offline ref (optional), sku = unique system key
    ['product', 'MY-HERB-001', '', '', 'Simple Herbal Syrup', '', 'HERB-SYR-001', '299', '499', '100', 'true', 'single',
      'A natural herbal syrup.', '', '', 'Herbal', '', '', 'WellnessCo', 'herbal|syrup', '', '',
      '4818', '', '0.5', '10', '10', '5',
      '', 'What is this product?', 'It is a herbal syrup.', 'How to use?', 'Take 2 tsp twice daily.',
      '', '', '', ''],
    // Variable product parent — sku = ARNICA-001 (variations reference this in post_parent)
    ['product', 'MY-ARNICA-001', '', '', 'Arnica Montana', '', 'ARNICA-001', '120', '200', '', 'true', 'variable',
      'Classic homeopathic remedy.', '', '', 'Homeopathic', 'Dilutions', '', 'SBL', 'homeopathic', '', '',
      '3004', '', '0.1', '6', '6', '8',
      '', 'How to store?', 'Store in a cool dry place.', '', '',
      '', '', '', ''],
    // Variation 1 — post_parent = parent SKU, variation_id = this variation SKU
    ['variation', '', 'ARNICA-001', 'ARNICA-30CH-30ML', '', '', 'ARNICA-30CH-30ML', '120', '200', '50', 'true', 'variation',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '',
      'Potency', '30CH', 'Volume', '30ml'],
    ['variation', '', 'ARNICA-001', 'ARNICA-200CH-30ML', '', '', 'ARNICA-200CH-30ML', '150', '250', '30', 'true', 'variation',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '',
      'Potency', '200CH', 'Volume', '30ml'],
  ];

  downloadCsv('products-import-template.csv', headers, rows);
}

function downloadSpecsTemplate(): void {
  downloadCsv('specs-template.csv',
    ['sku', 'heading', 'key', 'value'],
    [
      ['ARNICA-001', 'General', 'Form', 'Dilution'],
      ['ARNICA-001', 'General', 'Brand', 'SBL'],
      ['ARNICA-001', 'Composition', 'Main Ingredient', 'Arnica Montana'],
      ['HERB-SYR-001', 'General', 'Volume', '200ml'],
    ]
  );
}

function downloadWashCareTemplate(): void {
  downloadCsv('wash-care-template.csv',
    ['sku', 'text', 'iconName', 'iconUrl'],
    [
      ['HERB-SYR-001', 'Store in a cool dry place', 'thermometer', ''],
      ['HERB-SYR-001', 'Keep out of reach of children', 'alert', ''],
      ['HERB-SYR-001', 'Shake well before use', 'rotate', ''],
    ]
  );
}

function downloadFaqsTemplate(): void {
  downloadCsv('faqs-template.csv',
    ['sku', 'question', 'answer', 'order'],
    [
      ['ARNICA-001', 'What is Arnica Montana used for?', 'It is used for bruises, swelling, and muscle pain.', '0'],
      ['ARNICA-001', 'How to take this medicine?', 'Dissolve pills under the tongue. Do not touch with hands.', '1'],
      ['HERB-SYR-001', 'Is this sugar free?', 'Yes, this formulation is completely sugar free.', '0'],
    ]
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/**
 * THE TABLE'S COLUMNS — one fact each, so a column can be scanned down.
 *
 * The old table crammed the SKU under the name and the MRP under the price,
 * which meant neither could be compared row to row. `defaultHidden` keeps the
 * default view calm; the column chooser brings the rest back, per viewer.
 */
const COLUMNS: ColumnDef[] = [
  { key: 'product', label: 'Product', always: true },
  { key: 'sku', label: 'SKU' },
  { key: 'brand', label: 'Brand' },
  { key: 'type', label: 'Type', defaultHidden: true },
  { key: 'price', label: 'Price' },
  { key: 'mrp', label: 'MRP', defaultHidden: true },
  { key: 'categories', label: 'Categories' },
  { key: 'stock', label: 'Stock' },
  { key: 'hsn', label: 'HSN', defaultHidden: true },
  { key: 'tax', label: 'Tax rule', defaultHidden: true },
  { key: 'status', label: 'Status', always: true },
];

/** Right-aligned, tabular — money and counts only. */
const NUM_COLS = new Set(['price', 'mrp', 'stock']);

/** Tooltips instead of a paragraph under the header. */
const COL_HELP: Record<string, string> = {
  price: 'What a retail customer pays today, including any live sale price.',
  mrp: 'The printed price the shop strikes through.',
  stock: 'Whether this product, or any of its variations, has stock. Open the product for the figure per SKU.',
  hsn: 'The tax code on the invoice. A product whose variations each have their own HSN shows "per variation".',
  tax: 'The GST rule that sets this product’s rate. Blank means the store default applies.',
  type: 'Simple: one thing to buy. Variable: several potencies or pack sizes under one product.',
};

/** One cell. Kept at module level so the table body stays readable. */
function renderCell(key: string, p: any): React.ReactNode {
  switch (key) {
    case 'product':
      return (
        <div className="flex items-center gap-3">
          {p.images?.[0] ? (
            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              <img
                src={p.images[0]} alt="" className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-ink-mute">
              No image
            </div>
          )}
          <span className="font-medium text-foreground">{p.name || 'Unnamed product'}</span>
        </div>
      );
    case 'sku':
      return <span className="font-mono text-xs text-ink-soft">{p.sku || '—'}</span>;
    case 'brand':
      return p.brand_name || (typeof p.brand === 'object' ? p.brand?.name : '') || <span className="text-ink-mute">—</span>;
    case 'type':
      return <span className="text-xs text-ink-soft">{p.product_type === 'variation' ? 'Variable' : 'Simple'}</span>;
    case 'price':
      return fmtRupees(p.price ?? 0);
    case 'mrp':
      return (p.originalPrice ?? 0) > 0
        ? <span className="text-ink-soft">{fmtRupees(p.originalPrice)}</span>
        : <span className="text-ink-mute">—</span>;
    case 'hsn':
      return p.hsn_code
        ? <span className="font-mono text-xs">{p.hsn_code}</span>
        : p.product_type === 'variation'
          ? <span className="text-xs text-ink-mute">per variation</span>
          : <span className="text-ink-mute">—</span>;
    case 'tax':
      return p.tax_rule_id ? <span className="text-xs">Set</span> : <span className="text-xs text-ink-mute">Store default</span>;
    case 'stock':
      return p.in_stock
        ? <span className="text-good-ink">In stock</span>
        : <span className="text-bad-ink">Out</span>;
    case 'status':
      return (
        <Badge
          variant={p.isActive ? 'default' : 'destructive'}
          className={p.isActive ? 'border-good-200 bg-good/15 text-good-ink hover:bg-good/25' : ''}
        >
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    case 'categories': {
      const cats: any[] = p.categories || [];
      const featId = p.featuredCategory ? String(p.featuredCategory) : null;
      const parentCats = cats.filter((c: any) => !c.parent);
      const featCat = featId ? cats.find((c: any) => String(c._id) === featId && c.parent) : null;
      const visible = [...parentCats, ...(featCat ? [featCat] : [])];
      if (!visible.length && cats.length) visible.push(cats[0]);
      if (!visible.length) return <span className="text-xs text-ink-mute">Unassigned</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {visible.map((cat: any, i: number) => {
            const isFeatured = !!featId && String(cat._id) === featId;
            return (
              <Badge
                variant="secondary" key={`${p._id}-cat-${i}`}
                className={`text-xs font-normal ${isFeatured ? 'border-warn-400 bg-warn-bg text-warn-ink' : ''}`}
                title={isFeatured ? 'The category this product is featured in' : undefined}
              >
                {isFeatured && '★ '}{cat?.name || cat?.slug || 'Category'}
              </Badge>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}

type ImportType = 'products' | 'specs' | 'washcare' | 'faqs';

const IMPORT_LABELS: Record<ImportType, string> = {
  products: 'Products',
  specs:    'Specifications',
  washcare: 'Wash Care',
  faqs:     'FAQs',
};

const Products: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  // Backend requires products.manage for create/update/duplicate and
  // products.delete for removal (routes/products/handlers/*.ts) — was
  // `isAdmin || canAccess('products')`, a role==='admin' anti-pattern
  // (CLAUDE.md rule 7b) mixed with a module-availability check that answers
  // a different question ("did the store buy this feature") than
  // authorization ("can this person do this").
  const canManageProducts = hasPerm('products.manage');
  const canDeleteProducts = hasPerm('products.delete');

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState<ImportType>('products');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [allBrands, setAllBrands] = useState<Array<{ _id: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Pagination + filter state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [topCategories, setTopCategories] = useState<Array<{ _id: string; name: string; slug: string }>>([]);
  const [productForms, setProductForms] = useState<Array<{ slug: string; name: string }>>([]);
  const cols = useColumnChoice('products', COLUMNS);

  /**
   * FILTERS LIVE IN THE URL.
   *
   * A filtered list is then linkable, survives a refresh and comes back from
   * the browser's Back button — and "why is this list empty?" is answerable by
   * reading the address bar. `?search=` was already honoured (other screens
   * drill through to a SKU); every chip now joins it.
   */
  const [sp, setSp] = useSearchParams();
  const q = (k: string) => sp.get(k) ?? '';
  const missing = useMemo(() => (sp.get('missing') || '').split(',').filter(Boolean), [sp]);
  const setFilter = (patch: Record<string, string | string[]>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      const value = Array.isArray(v) ? v.join(',') : v;
      if (value) next.set(k, value); else next.delete(k);
    }
    setSp(next, { replace: true });
    setPage(1);
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    const s = sp.get('search'); if (s) next.set('search', s);
    setSp(next, { replace: true });
    setPage(1);
  };
  const activeFilterCount =
    ['status', 'category', 'brand', 'form', 'stock', 'sort'].filter((k) => q(k)).length + missing.length;

  // Search — debounced, 3-char minimum (matches the project's search convention elsewhere).
  const [searchInput, setSearchInput] = useState(() => sp.get('search') ?? '');
  const search = (sp.get('search') ?? '').trim().length >= 3 ? (sp.get('search') ?? '').trim() : '';
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get('search') ?? '') !== searchInput) setFilter({ search: searchInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const toggleSelect = (id: string) => setSelectedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelectAll = () => setSelectedIds(products.every((p) => selectedIds.has(p._id)) ? new Set() : new Set(products.map((p) => p._id)));
  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p._id));

  // What the chips can offer. A list that comes back empty simply removes its
  // chip (FilterChips drops a group with no options) — no dead dropdowns.
  useEffect(() => {
    categoriesAPI.list().then((res: any) => {
      let cats: any[] = Array.isArray(res) ? res : (res?.data || res?.data?.data || []);
      cats = cats.filter((c: any) => !c.parent);
      setTopCategories(cats.map((c: any) => ({ _id: String(c._id || c.id || ''), name: c.name || '', slug: c.slug || '' })));
    }).catch(() => {});
    brandsAPI.list().then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res?.data || []);
      setAllBrands(list.map((b: any) => ({ _id: String(b._id || b.id || ''), name: b.name || '' })));
    }).catch(() => {});
    // Product form is a card axis on this catalogue (brand + form group the
    // storefront's cards). A store that does not use it gets no Form chip.
    attributeValuesAPI.getByAttributeSlug('product-form', { isActive: true })
      .then((vals: any[]) => setProductForms(
        (vals || []).map((v) => ({ slug: String(v.slug || ''), name: String(v.name || v.slug || '') }))
          .filter((v) => v.slug)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sp]);

  const sanitizeProduct = (product: any): any => {
    const sanitized = { ...product };
    // PostgreSQL backend returns `id` (UUID); MongoDB returns `_id`. Normalize to `_id`.
    if (!sanitized._id && sanitized.id) sanitized._id = String(sanitized.id);
    if (sanitized._id && typeof sanitized._id !== 'string') sanitized._id = String(sanitized._id);
    if (Array.isArray(sanitized.categories)) {
      sanitized.categories = sanitized.categories.map((cat: any) => {
        if (typeof cat === 'string') return cat;
        if (cat && typeof cat === 'object' && cat._id) return { ...cat, _id: typeof cat._id === 'string' ? cat._id : String(cat._id) };
        return cat;
      });
    }
    if (Array.isArray(sanitized.images)) {
      sanitized.images = sanitized.images.map((img: any) => typeof img === 'string' ? img : null).filter(Boolean);
    }
    // PostgreSQL list response uses final_price/selling_price/mrp/is_active/featured_category_id.
    // Normalize to the legacy field names this page renders, falling back for safety.
    const sellingPrice = sanitized.final_price ?? sanitized.selling_price ?? sanitized.price;
    const mrp = sanitized.mrp ?? sanitized.originalPrice;
    sanitized.price = Number(sellingPrice) || 0;
    sanitized.originalPrice = Number(mrp) || 0;
    sanitized.isActive = sanitized.is_active !== undefined ? sanitized.is_active !== false : sanitized.isActive !== false;
    sanitized.featuredCategory = sanitized.featured_category_id ?? sanitized.featuredCategory ?? null;
    if (sanitized.name !== undefined) sanitized.name = String(sanitized.name || '');
    return sanitized;
  };

  /** Every chip becomes one query param. The URL is the single source. */
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit: PAGE_SIZE };
      if (search) params.search = search;
      if (q('category')) params.categorySlug = q('category');
      if (q('brand')) params.brand = q('brand');
      if (q('status')) params.active = q('status') === 'active' ? 'true' : 'false';
      if (q('stock')) params.inStock = q('stock') === 'in' ? 'true' : 'false';
      if (q('sort')) params.sort = q('sort');
      if (q('form')) params.attributes = JSON.stringify({ 'product-form': q('form') });
      if (missing.length) params.missing = missing.join(',');
      const response = await productsAPI.getAll(params);
      let list: any[] = Array.isArray(response) ? response : (response?.data?.data || response?.data || []);
      setProducts(list.map(sanitizeProduct));
      setTotal(typeof response?.total === 'number' ? response.total : list.length);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      // POST /products/:id/duplicate CREATES an inactive standalone copy and
      // returns it. The axios interceptor has ALREADY unwrapped {success,data}
      // — the old `response?.data` check inspected a key that no longer exists
      // and alerted "failed" even though the copy was created.
      const created: any = await productsAPI.duplicateAsVariant(id, {});
      const product = created?.id || created?.slug ? created : (created?.data ?? created);
      if (product?.slug || product?.id || product?._id) {
        navigate(`/products/${product.slug || product.id || product._id}/edit`);
      } else {
        alert('Duplicate failed — the server returned no product.');
      }
    } catch (error) {
      console.error('Failed to duplicate:', error);
      alert('Failed to duplicate product. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id || id === 'undefined') { alert('Cannot delete: product ID is missing.'); return; }
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await productsAPI.delete(id);
      fetchProducts();
    } catch (error) {
      alert('Failed to delete product');
    }
  };

  const handleExport = async (scope: 'page' | 'selected' | 'all') => {
    if (scope === 'selected' && selectedIds.size === 0) { alert('No products selected.'); return; }
    setExporting(true);
    try {
      const date = new Date().toISOString().split('T')[0];

      if (scope === 'all') {
        // Full catalog → the complete linked workbook: products + variations
        // (with b2b_price), categories, tags, attributes, A+ content, brands and
        // cross-sell/upsell links — and it re-imports. The old flat CSV only had
        // 12 product columns and dropped variations, B2B, categories and links.
        await productsAPI.downloadWorkbook('export');
        return;
      }

      // Page / selected: client-side (small dataset, already in memory)
      const list = scope === 'page' ? products : products.filter((p) => selectedIds.has(p._id));
      const brandIdToName = new Map<string, string>();
      try {
        const brandRes = await brandsAPI.list();
        const brandList = Array.isArray(brandRes) ? brandRes : (brandRes?.data || []);
        brandList.forEach((b: any) => { if (b._id && b.name) brandIdToName.set(String(b._id), b.name); });
      } catch {}

      const label = scope === 'page' ? 'page' : 'selected';
      const csv = productsToWooCSV(list, brandIdToName);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `products-${label}-${date}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Build SKU → MongoId map for all products (no 100-limit)
  const buildSkuMap = async (): Promise<Map<string, string>> => {
    const skuList = await productsAPI.getAllSkus();
    return new Map(skuList.filter(p => p.sku && p._id).map(p => [p.sku, p._id]));
  };

  const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Ensures all attribute names+values from import CSV exist in the DB.
  // Returns a slug-keyed map: { [attrSlug]: { id, values: { [valueSlug]: valueId } } }
  const ensureAttributesExist = async (
    attrNameValuePairs: Array<{ name: string; value: string }>
  ): Promise<Map<string, { id: string; slug: string; values: Map<string, string> }>> => {
    const result = new Map<string, { id: string; slug: string; values: Map<string, string> }>();

    // Group by attribute name
    const byName = new Map<string, Set<string>>();
    for (const { name, value } of attrNameValuePairs) {
      if (!name.trim()) continue;
      if (!byName.has(name)) byName.set(name, new Set());
      if (value.trim()) byName.get(name)!.add(value.trim());
    }
    if (byName.size === 0) return result;

    // Fetch existing attributes
    const existingAttrs: any[] = await attributesAPI.list().catch(() => []);
    const attrBySlug = new Map<string, any>(existingAttrs.map((a: any) => [a.slug, a]));
    const attrByName = new Map<string, any>(existingAttrs.map((a: any) => [a.name.toLowerCase(), a]));

    for (const [name, valueSet] of byName) {
      const slug = toSlug(name);
      let attr = attrBySlug.get(slug) || attrByName.get(name.toLowerCase());

      if (!attr) {
        // Create attribute
        try {
          attr = await attributesAPI.create({ name, slug, type: 'select', isActive: true });
          attr = attr?.data || attr;
        } catch { /* may already exist due to race */ attr = attrBySlug.get(slug); }
      }
      if (!attr?.id && !attr?._id) continue;
      const attrId = String(attr.id || attr._id);
      const attrSlug = attr.slug || slug;

      const valuesMap = new Map<string, string>();
      result.set(attrSlug, { id: attrId, slug: attrSlug, values: valuesMap });

      // Fetch existing values for this attribute
      const existingVals: any[] = await attributeValuesAPI.getByAttributeSlug(attrSlug).catch(() => []);
      const valBySlug = new Map<string, any>(existingVals.map((v: any) => [v.slug, v]));
      const valByName = new Map<string, any>(existingVals.map((v: any) => [v.name.toLowerCase(), v]));
      for (const v of existingVals) {
        valuesMap.set(v.slug, v.id || v._id);
      }

      for (const valueName of valueSet) {
        const valueSlug = toSlug(valueName);
        if (!valBySlug.has(valueSlug) && !valByName.has(valueName.toLowerCase())) {
          try {
            const newVal = await attributeValuesAPI.create(attrId, { name: valueName, slug: valueSlug, isActive: true });
            const created = newVal?.data || newVal;
            if (created?.id || created?._id) valuesMap.set(valueSlug, String(created.id || created._id));
          } catch { /* ignore duplicate */ }
        } else {
          const existing = valBySlug.get(valueSlug) || valByName.get(valueName.toLowerCase());
          if (existing) valuesMap.set(valueSlug, String(existing.id || existing._id));
        }
      }
    }

    return result;
  };

  const handleBulkAssignBrand = async () => {
    if (!bulkBrand || selectedIds.size === 0) return;
    setBulkAssigning(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => productsAPI.update(id, { brand: bulkBrand })));
      fetchProducts();
      setSelectedIds(new Set());
      setBulkBrand('');
    } catch {
      alert('Failed to assign brand to some products.');
    } finally {
      setBulkAssigning(false);
    }
  };

  /**
   * Put the selected products on, or take them off, the website. The same
   * `products.manage` write the Status switch on the product form makes — this
   * is only the bulk door to it, which the list never had.
   */
  const handleBulkActive = async (isActive: boolean) => {
    if (selectedIds.size === 0) return;
    const verb = isActive ? 'Show' : 'Hide';
    if (!confirm(`${verb} ${selectedIds.size} product${selectedIds.size !== 1 ? 's' : ''} on the website?`)) return;
    setBulkAssigning(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => productsAPI.update(id, { isActive })));
      fetchProducts();
      setSelectedIds(new Set());
    } catch {
      alert('Some products could not be changed. Reload and check which.');
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleImportProducts = async (rows: Record<string, string>[]) => {
    let categories: { _id: string; name: string; slug: string }[] = [];
    let brands: { _id: string; name: string; slug: string }[] = [];
    const [catRes, brandRes, skuToMongoId] = await Promise.all([
      categoriesAPI.list().catch(() => []),
      brandsAPI.list().catch(() => []),
      buildSkuMap(),
    ]);
    categories = (Array.isArray(catRes) ? catRes : (catRes?.data || [])).map((c: any) => ({ _id: String(c._id || c.id || ''), name: c.name || '', slug: c.slug || '' }));
    brands = (Array.isArray(brandRes) ? brandRes : (brandRes?.data || [])).map((b: any) => ({ _id: String(b._id || b.id || ''), name: b.name || '', slug: b.slug || '' }));

    // Collect all attribute name/value pairs from variation rows
    const attrPairs: Array<{ name: string; value: string }> = [];
    for (const row of rows) {
      if ((row.post_type || '').toLowerCase() !== 'variation') continue;
      let ai = 1;
      while (row[`attribute${ai}_name`] !== undefined) {
        const n = row[`attribute${ai}_name`]?.trim() || '';
        const v = row[`attribute${ai}_value`]?.trim() || '';
        if (n) attrPairs.push({ name: n, value: v });
        ai++;
      }
    }

    // Auto-create missing attributes and values; get slug→id map
    const attrMap = await ensureAttributesExist(attrPairs);

    const toUpsert = wooRowsToProducts(rows, { categories, brands });

    // Remap variation attributes from display names to slugs
    for (const rec of toUpsert) {
      if (!rec.variations?.length) continue;
      rec.variations = rec.variations.filter(Boolean).map((v: any) => {
        if (!v.attributes || typeof v.attributes !== 'object') return v;
        const remapped: Record<string, string> = {};
        for (const [rawName, rawValue] of Object.entries(v.attributes)) {
          const attrSlug = toSlug(rawName as string);
          const valSlug = toSlug(rawValue as string);
          // Use slug form so backend stores consistent keys
          remapped[attrSlug] = valSlug;
        }
        return { ...v, attributes: remapped };
      });
      // Set attributeIds on the product from discovered attributes
      if (attrMap.size > 0) {
        const attrIds = Array.from(new Set(
          rec.variations.flatMap((v: any) =>
            Object.keys(v.attributes || {}).map((slug: string) => attrMap.get(slug)?.id).filter(Boolean)
          )
        ));
        if (attrIds.length) rec.attributeIds = attrIds;
      }
    }

    let created = 0, updated = 0;
    const errors: string[] = [];
    for (const rec of toUpsert) {
      const existingId = rec.sku ? skuToMongoId.get(rec.sku) : undefined;
      try {
        if (existingId) { await productsAPI.update(existingId, rec); updated++; }
        else             { await productsAPI.create(rec); created++; }
      } catch (err: any) {
        errors.push(`${rec.name || rec.sku || 'Product'}: ${err?.message || 'Unknown error'}`);
      }
    }
    return { created, updated, errors };
  };

  const handleImportSpecs = async (rows: Record<string, string>[]) => {
    const skuToMongoId = await buildSkuMap();
    // Group rows by SKU → heading → [{key,value}]
    const skuSpecs = new Map<string, Map<string, Array<{ key: string; value: string }>>>();
    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku || !row.key?.trim()) continue;
      if (!skuSpecs.has(sku)) skuSpecs.set(sku, new Map());
      const headingMap = skuSpecs.get(sku)!;
      const heading = row.heading?.trim() || 'General';
      if (!headingMap.has(heading)) headingMap.set(heading, []);
      headingMap.get(heading)!.push({ key: row.key.trim(), value: row.value?.trim() || '' });
    }
    let updated = 0;
    const errors: string[] = [];
    for (const [sku, headingMap] of skuSpecs) {
      const id = skuToMongoId.get(sku);
      if (!id) { errors.push(`SKU not found: ${sku}`); continue; }
      const specifications = Array.from(headingMap.entries()).map(([heading, items]) => ({ heading, items }));
      try { await productsAPI.update(id, { specifications }); updated++; }
      catch (err: any) { errors.push(`${sku}: ${err?.message || 'Unknown error'}`); }
    }
    return { created: 0, updated, errors };
  };

  const handleImportWashCare = async (rows: Record<string, string>[]) => {
    const skuToMongoId = await buildSkuMap();
    // Group rows by SKU → [{text, iconName, iconUrl}]
    const skuWash = new Map<string, Array<{ text: string; iconName?: string; iconUrl?: string }>>();
    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku || !row.text?.trim()) continue;
      if (!skuWash.has(sku)) skuWash.set(sku, []);
      skuWash.get(sku)!.push({
        text: row.text.trim(),
        ...(row.iconName?.trim() ? { iconName: row.iconName.trim() } : {}),
        ...(row.iconUrl?.trim()  ? { iconUrl:  row.iconUrl.trim()  } : {}),
      });
    }
    let updated = 0;
    const errors: string[] = [];
    for (const [sku, washCareInstructions] of skuWash) {
      const id = skuToMongoId.get(sku);
      if (!id) { errors.push(`SKU not found: ${sku}`); continue; }
      try { await productsAPI.update(id, { washCareInstructions }); updated++; }
      catch (err: any) { errors.push(`${sku}: ${err?.message || 'Unknown error'}`); }
    }
    return { created: 0, updated, errors };
  };

  const handleImportFaqs = async (rows: Record<string, string>[]) => {
    const skuToMongoId = await buildSkuMap();
    // Group rows by SKU → [{question, answer, order}]
    const skuFaqs = new Map<string, Array<{ question: string; answer: string; order: number }>>();
    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku || !row.question?.trim()) continue;
      if (!skuFaqs.has(sku)) skuFaqs.set(sku, []);
      skuFaqs.get(sku)!.push({
        question: row.question.trim(),
        answer: row.answer?.trim() || '',
        order: parseInt(row.order, 10) || skuFaqs.get(sku)!.length,
      });
    }
    let updated = 0;
    const errors: string[] = [];
    for (const [sku, items] of skuFaqs) {
      const id = skuToMongoId.get(sku);
      if (!id) { errors.push(`SKU not found: ${sku}`); continue; }
      const pageSections = [{ sectionId: 'faq', enabled: true, order: 0, customData: { items } }];
      try { await productsAPI.update(id, { pageSections }); updated++; }
      catch (err: any) { errors.push(`${sku}: ${err?.message || 'Unknown error'}`); }
    }
    return { created: 0, updated, errors };
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        alert('No data rows found. Ensure the file has a header row and at least one data row.');
        return;
      }
      let result: { created: number; updated: number; errors: string[] };
      if (importType === 'specs')    result = await handleImportSpecs(rows);
      else if (importType === 'washcare') result = await handleImportWashCare(rows);
      else if (importType === 'faqs')    result = await handleImportFaqs(rows);
      else                               result = await handleImportProducts(rows);

      setImportResult(result);
      if (importType === 'products') { setPage(1); fetchProducts(); }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed. Check the file format.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── The toolbar's chips. A group with no options is dropped by FilterChips,
  //    so a store with no brands (or no product-form axis) never sees a dead
  //    dropdown — that is what makes the row contextual.
  const chipGroups: ChipGroup[] = [
    {
      key: 'status', label: 'Status', value: q('status'),
      onChange: (v: string) => setFilter({ status: v }),
      options: [
        { value: 'active', label: 'Active', hint: 'on the website' },
        { value: 'inactive', label: 'Inactive', hint: 'hidden' },
      ],
    },
    {
      key: 'category', label: 'Category', value: q('category'),
      onChange: (v: string) => setFilter({ category: v }),
      options: topCategories.map((c) => ({ value: c.slug, label: c.name })),
    },
    {
      key: 'brand', label: 'Brand', value: q('brand'),
      onChange: (v: string) => setFilter({ brand: v }),
      options: allBrands.map((b) => ({ value: b._id, label: b.name })),
    },
    {
      key: 'form', label: 'Form', value: q('form'),
      onChange: (v: string) => setFilter({ form: v }),
      help: 'Dilution, mother tincture, tablet…',
      options: productForms.map((f) => ({ value: f.slug, label: f.name })),
    },
    {
      key: 'stock', label: 'Stock', value: q('stock'),
      onChange: (v: string) => setFilter({ stock: v }),
      help: 'The product itself, or any of its variations.',
      options: [
        { value: 'in', label: 'In stock' },
        { value: 'out', label: 'Out of stock' },
      ],
    },
    {
      key: 'missing', label: 'Needs filling in', value: missing, multiple: true,
      onChange: (v: string[]) => setFilter({ missing: v }),
      help: 'Products still missing something. Pick two to see the ones missing both.',
      options: [
        { value: 'images', label: 'No image' },
        { value: 'hsn', label: 'No HSN code' },
        { value: 'tax_rule', label: 'No tax rule' },
        { value: 'b2b_price', label: 'No wholesale price' },
      ],
    },
    {
      key: 'sort', label: 'Sort', value: q('sort'),
      onChange: (v: string) => setFilter({ sort: v }),
      options: [
        { value: 'newest', label: 'Newest first' },
        { value: 'oldest', label: 'Oldest first' },
        { value: 'name-asc', label: 'Name A to Z' },
        { value: 'name-desc', label: 'Name Z to A' },
        { value: 'price-asc', label: 'Price low to high' },
        { value: 'price-desc', label: 'Price high to low' },
      ],
    },
  ];

  const visibleCols = COLUMNS.filter((c) => cols.shows(c.key));

  return (
    <Page width="full">
      <PageHeader
        title="Products"
        description="Everything the shop sells. Open one to edit its details, prices, variations and page."
        actions={
          <>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

            {/* IMPORT — one control. The workbook is the whole catalogue; the
                four CSVs below it each change one part of existing products. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={importing}>
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {importing ? `Importing ${IMPORT_LABELS[importType]}…` : 'Import'} <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild>
                  <Link to="/products/import-export">
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Catalogue workbook (.xlsx)
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(['products', 'specs', 'washcare', 'faqs'] as ImportType[]).map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => { setImportType(type); setTimeout(() => fileInputRef.current?.click(), 0); }}
                  >
                    {IMPORT_LABELS[type]} (.csv)
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={downloadTemplate}>Blank products template</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadSpecsTemplate}>Blank specifications template</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadWashCareTemplate}>Blank wash-care template</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadFaqsTemplate}>Blank FAQs template</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* EXPORT — one control, three scopes. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => handleExport('all')}>
                  Whole catalogue — workbook (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport('page')} disabled={products.length === 0}>
                  This page ({products.length}) — .csv
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('selected')} disabled={selectedIds.size === 0}>
                  Selected ({selectedIds.size}) — .csv
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {canManageProducts && (
              <Button asChild>
                <Link to="/products/new"><FaPlus className="mr-2" /> Add product</Link>
              </Button>
            )}
          </>
        }
      />

      {importResult && (
        <div className={`rounded-md border p-4 text-sm ${importResult.errors.length > 0 ? 'border-warn-300 bg-warn-bg text-warn-ink' : 'border-good-300 bg-good-bg text-good-ink'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-1 font-semibold">{IMPORT_LABELS[importType]} import complete</p>
              <p>
                {importType === 'products'
                  ? `${importResult.created} created, ${importResult.updated} updated`
                  : `${importResult.updated} product${importResult.updated !== 1 ? 's' : ''} updated`}
                {importResult.errors.length > 0 ? `, ${importResult.errors.length} failed` : ''}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
                  {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  {importResult.errors.length > 10 && <li>…and {importResult.errors.length - 10} more</li>}
                </ul>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="ml-4 text-current opacity-50 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {/* ── TOOLBAR: search · count · chips · columns ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-80 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or SKU…"
              aria-label="Search products"
              data-testid="products-search"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-8 text-sm shadow-sm focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
            {searchInput && (
              <button
                type="button" aria-label="Clear search" onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="text-sm text-ink-soft" data-testid="products-count">
            {loading ? 'Counting…' : `${total.toLocaleString('en-IN')} product${total !== 1 ? 's' : ''}`}
            {activeFilterCount > 0 && !loading && <span className="text-ink-mute"> matching your filters</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ColumnChooser columns={COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />
          </div>
        </div>

        <FilterChips groups={chipGroups} onClearAll={clearFilters} />
      </div>

      {/* Bulk actions — only when something is selected. */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-brand/20 bg-brand/10 px-4 py-2 text-sm">
          <span className="font-medium text-brand-700">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleExport('selected')} disabled={exporting}>
            <Download className="mr-1 h-3 w-3" /> Export selected
          </Button>
          {allBrands.length > 0 && canManageProducts && (
            <div className="flex items-center gap-1">
              <select
                value={bulkBrand}
                onChange={(e) => setBulkBrand(e.target.value)}
                aria-label="Assign a brand to the selected products"
                className="h-7 rounded border border-line bg-surface px-2 text-xs"
              >
                <option value="">Assign brand…</option>
                {allBrands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkAssignBrand} disabled={!bulkBrand || bulkAssigning}>
                {bulkAssigning ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          )}
          {canManageProducts && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkActive(true)} disabled={bulkAssigning}>
                Activate
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkActive(false)} disabled={bulkAssigning}>
                Deactivate
              </Button>
            </>
          )}
          <button className="ml-auto text-xs text-ink-soft hover:text-ink" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-2">
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                  aria-label="Select every product on this page"
                  className="cursor-pointer rounded border-line"
                />
              </TableHead>
              {visibleCols.map((c) => (
                <TableHead key={c.key} className={NUM_COLS.has(c.key) ? 'text-right' : undefined}>
                  {c.label}
                  {COL_HELP[c.key] && <InfoTip className="ml-1" text={COL_HELP[c.key]} />}
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          {loading ? (
            <TableSkeleton cols={visibleCols.length + 2} rows={8} />
          ) : (
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleCols.length + 2} className="p-0">
                    <EmptyState
                      icon={PackageSearch}
                      title={search || activeFilterCount ? 'Nothing matches' : 'No products yet'}
                      description={
                        search || activeFilterCount
                          ? 'No product matches this search and these filters.'
                          : 'Add your first product, or bring the catalogue in from a workbook.'
                      }
                      action={
                        search || activeFilterCount ? (
                          <Button variant="outline" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                            Clear search and filters
                          </Button>
                        ) : canManageProducts ? (
                          <Button asChild size="sm"><Link to="/products/new">Add a product</Link></Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product._id} className={selectedIds.has(product._id) ? 'bg-muted/50' : ''}>
                    <TableCell className="w-10">
                      <input
                        type="checkbox" checked={selectedIds.has(product._id)} onChange={() => toggleSelect(product._id)}
                        aria-label={`Select ${product.name || 'product'}`}
                        className="cursor-pointer rounded border-line"
                      />
                    </TableCell>

                    {visibleCols.map((c) => (
                      <TableCell key={c.key} className={NUM_COLS.has(c.key) ? 'text-right tabular-nums' : undefined}>
                        {renderCell(c.key, product)}
                      </TableCell>
                    ))}

                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canManageProducts && (
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" asChild title="Edit product">
                            <Link to={`/products/${product.slug || product._id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {/* Page content (page_sections + aplus_content) is gated by the
                            aplus_content module — with it off the backend strips the
                            save, so don't offer a dead editor. */}
                        {canManageProducts && canAccess('aplus_content') && (
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" asChild title="Page content (sections, highlights, layout)">
                            <Link to={`/products/${product.slug || product._id}/edit?tab=content`}>
                              <FaCog className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {canManageProducts && (
                          <Button
                            variant="outline" size="sm" className="h-8 w-8 p-0" title="Duplicate product"
                            onClick={() => handleDuplicate(product._id)} disabled={duplicatingId === product._id}
                          >
                            {duplicatingId === product._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FaCopy className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {canDeleteProducts && (
                          <Button
                            variant="outline" size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete product"
                            onClick={() => handleDelete(product._id)}
                          >
                            <FaTrash className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} variant="numbered" />
    </Page>
  );
};

export default Products;
