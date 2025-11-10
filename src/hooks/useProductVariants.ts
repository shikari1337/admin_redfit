import { useState, useCallback } from 'react';
import {
  ProductVariant,
  VariantType,
  VariantOption,
  VariantCombination,
} from '../types/productForm';

interface UseProductVariantsProps {
  basePrice: number;
  baseOriginalPrice: number;
  getBaseSku: () => string;
}

interface UseProductVariantsReturn {
  // Shopify-style state
  variantTypes: VariantType[];
  variantOptions: Record<string, string[]>;
  variantColorCodes: Record<string, Record<string, string>>;
  variantCombinations: VariantCombination[];
  useShopifyVariants: boolean;
  newVariantTypeName: string;
  newOptionInputs: Record<string, string>;

  // Shopify-style actions
  setUseShopifyVariants: (value: boolean) => void;
  setNewVariantTypeName: (value: string) => void;
  setNewOptionInputs: (value: Record<string, string>) => void;
  addVariantType: (typeName: string, isColor?: boolean) => void;
  removeVariantType: (typeId: string) => void;
  addVariantOption: (typeId: string, value: string, colorCode?: string) => void;
  removeVariantOption: (typeId: string, value: string) => void;
  updateVariantCombination: (combinationId: string, field: keyof VariantCombination, value: any) => void;
  regenerateAllSkus: () => void;
  generateVariantCombinations: () => void;
  convertCombinationsToVariants: (combinations: VariantCombination[]) => ProductVariant[];
  convertVariantsToShopifyFormat: (variants: ProductVariant[]) => void;

  // Legacy variant state
  variants: ProductVariant[];
  setVariants: (variants: ProductVariant[]) => void;
  addVariant: () => void;
  updateVariant: (index: number, field: keyof ProductVariant, value: any) => void;
  removeVariant: (index: number) => void;
  addVariantSize: (variantIndex: number) => void;
  updateVariantSize: (variantIndex: number, sizeIndex: number, field: string, value: any) => void;
  removeVariantSize: (variantIndex: number, sizeIndex: number) => void;
  regenerateAllSkusLegacy: () => void;
  regenerateVariantSkus: (variantIndex: number) => void;
}

export const useProductVariants = ({
  basePrice,
  baseOriginalPrice,
  getBaseSku,
}: UseProductVariantsProps): UseProductVariantsReturn => {
  // Shopify-style state
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [variantOptions, setVariantOptions] = useState<Record<string, string[]>>({});
  const [variantColorCodes, setVariantColorCodes] = useState<Record<string, Record<string, string>>>({});
  const [variantCombinations, setVariantCombinations] = useState<VariantCombination[]>([]);
  const [useShopifyVariants, setUseShopifyVariants] = useState(false);
  const [newVariantTypeName, setNewVariantTypeName] = useState('');
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});

  // Legacy variant state
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Generate SKU for a variant size
  const generateSkuForSize = useCallback(
    (baseSku: string, colorName: string, size: string): string => {
      const colorCode = (colorName || 'DEF').toUpperCase().slice(0, 4).replace(/[^A-Z0-9]/g, '') || 'DEF';
      const sizeCode = (size || 'UNK').toUpperCase().slice(0, 4).replace(/[^A-Z0-9]/g, '') || 'UNK';
      const base = (baseSku || getBaseSku()).toUpperCase();
      return `${base}-${colorCode}-${sizeCode}`.slice(0, 48);
    },
    [getBaseSku]
  );

  // Generate variant combinations
  const generateVariantCombinations = useCallback(() => {
    if (variantTypes.length === 0) {
      setVariantCombinations([]);
      return;
    }

    const optionArrays = variantTypes
      .map((type) => {
        const options = variantOptions[type.id] || [];
        return options.map((value) => ({
          typeId: type.id,
          typeName: type.name,
          value,
          colorCode: variantColorCodes[type.id]?.[value],
        }));
      })
      .filter((arr) => arr.length > 0);

    if (optionArrays.length === 0) {
      setVariantCombinations([]);
      return;
    }

    const combinations: VariantCombination[] = [];
    const existingCombinationsMap = new Map<string, VariantCombination>();

    variantCombinations.forEach((comb) => {
      const signature = comb.options.map((o) => `${o.typeId}:${o.value}`).join('|');
      existingCombinationsMap.set(signature, comb);
    });

    const generate = (current: VariantOption[], index: number) => {
      if (index === optionArrays.length) {
        const signature = current.map((o) => `${o.typeId}:${o.value}`).join('|');
        const existing = existingCombinationsMap.get(signature);

        if (existing) {
          combinations.push(existing);
        } else {
          const baseSku = getBaseSku();
          const skuParts = current.map((opt) => {
            const value = opt.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
            return value || 'DEF';
          });
          const sku = `${baseSku}-${skuParts.join('-')}`.slice(0, 48);

          combinations.push({
            id: `comb-${Date.now()}-${Math.random()}`,
            options: [...current],
            sku,
            price: basePrice || 0,
            originalPrice: baseOriginalPrice || 0,
            stock: 0,
            images: [],
          });
        }
        return;
      }

      optionArrays[index].forEach((option) => {
        generate([...current, option], index + 1);
      });
    };

    generate([], 0);
    setVariantCombinations(combinations);
  }, [variantTypes, variantOptions, variantColorCodes, variantCombinations, basePrice, baseOriginalPrice, getBaseSku]);

  // Add variant type
  const addVariantType = useCallback(
    (typeName: string, isColor: boolean = false) => {
      const newType: VariantType = {
        id: `type-${Date.now()}-${Math.random()}`,
        name: typeName.trim(),
        isColor,
      };
      setVariantTypes((prev) => [...prev, newType]);
      setVariantOptions((prev) => ({ ...prev, [newType.id]: [] }));
      setVariantColorCodes((prev) => ({ ...prev, [newType.id]: {} }));
      setNewVariantTypeName('');
      setTimeout(() => {
        generateVariantCombinations();
      }, 0);
    },
    [generateVariantCombinations]
  );

  // Remove variant type
  const removeVariantType = useCallback(
    (typeId: string) => {
      setVariantTypes((prev) => prev.filter((t) => t.id !== typeId));
      setVariantOptions((prev) => {
        const newOptions = { ...prev };
        delete newOptions[typeId];
        return newOptions;
      });
      setVariantColorCodes((prev) => {
        const newColorCodes = { ...prev };
        delete newColorCodes[typeId];
        return newColorCodes;
      });
      setTimeout(() => {
        generateVariantCombinations();
      }, 0);
    },
    [generateVariantCombinations]
  );

  // Add variant option
  const addVariantOption = useCallback(
    (typeId: string, value: string, colorCode?: string) => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return;

      setVariantOptions((prev) => {
        const currentOptions = prev[typeId] || [];
        if (currentOptions.includes(trimmedValue)) return prev;
        return {
          ...prev,
          [typeId]: [...currentOptions, trimmedValue],
        };
      });

      if (colorCode) {
        setVariantColorCodes((prev) => {
          const typeColorCodes = prev[typeId] || {};
          return {
            ...prev,
            [typeId]: {
              ...typeColorCodes,
              [trimmedValue]: colorCode,
            },
          };
        });
      }

      setNewOptionInputs((prev) => ({ ...prev, [typeId]: '' }));
      setTimeout(() => {
        generateVariantCombinations();
      }, 0);
    },
    [generateVariantCombinations]
  );

  // Remove variant option
  const removeVariantOption = useCallback(
    (typeId: string, value: string) => {
      setVariantOptions((prev) => ({
        ...prev,
        [typeId]: (prev[typeId] || []).filter((opt) => opt !== value),
      }));

      setVariantColorCodes((prev) => {
        const typeColorCodes = prev[typeId] || {};
        if (typeColorCodes[value]) {
          const newColorCodes = { ...typeColorCodes };
          delete newColorCodes[value];
          return {
            ...prev,
            [typeId]: newColorCodes,
          };
        }
        return prev;
      });

      setTimeout(() => {
        generateVariantCombinations();
      }, 0);
    },
    [generateVariantCombinations]
  );

  // Update variant combination
  const updateVariantCombination = useCallback(
    (combinationId: string, field: keyof VariantCombination, value: any) => {
      setVariantCombinations((prev) =>
        prev.map((comb) => (comb.id === combinationId ? { ...comb, [field]: value } : comb))
      );
    },
    []
  );

  // Regenerate all SKUs
  const regenerateAllSkus = useCallback(() => {
    const baseSku = getBaseSku();
    setVariantCombinations((prev) =>
      prev.map((comb) => {
        const skuParts = comb.options.map((opt) =>
          opt.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
        );
        const newSku = `${baseSku}-${skuParts.join('-')}`.slice(0, 48);
        return { ...comb, sku: newSku };
      })
    );
  }, [getBaseSku]);

  // Convert combinations to variants
  const convertCombinationsToVariants = useCallback(
    (combinations: VariantCombination[]): ProductVariant[] => {
      const colorType = variantTypes.find((t) => t.isColor || t.name.toLowerCase() === 'color');
      const sizeType = variantTypes.find((t) => t.name.toLowerCase() === 'size');

      if (!colorType && !sizeType) {
        return combinations.map((comb) => ({
          colorName: comb.options.map((o) => o.value).join(' / ') || 'Default',
          colorCode: '#000000',
          price: comb.price,
          originalPrice: comb.originalPrice,
          images: comb.images || [],
          sizes: sizeType
            ? comb.options
                .filter((o) => o.typeId === sizeType.id)
                .map((opt) => ({
                  size: opt.value,
                  stock: comb.stock,
                  sku: comb.sku,
                  price: comb.price,
                  originalPrice: comb.originalPrice,
                }))
            : [
                {
                  size: 'One Size',
                  stock: comb.stock,
                  sku: comb.sku,
                  price: comb.price,
                  originalPrice: comb.originalPrice,
                },
              ],
        }));
      }

      const variantsMap = new Map<string, ProductVariant>();

      combinations.forEach((comb) => {
        const colorOption = comb.options.find((o) => o.typeId === colorType?.id);
        const sizeOptions = comb.options.filter((o) => o.typeId === sizeType?.id);

        const colorName = colorOption?.value || 'Default';
        const colorCode = colorOption?.colorCode || '#000000';
        const variantKey = colorName;

        if (!variantsMap.has(variantKey)) {
          variantsMap.set(variantKey, {
            colorName,
            colorCode,
            price: comb.price,
            originalPrice: comb.originalPrice,
            images: comb.images || [],
            sizes: [],
          });
        }

        const variant = variantsMap.get(variantKey)!;
        if (sizeOptions.length > 0) {
          sizeOptions.forEach((sizeOpt) => {
            variant.sizes.push({
              size: sizeOpt.value,
              stock: comb.stock,
              sku: comb.sku,
              price: comb.price,
              originalPrice: comb.originalPrice,
            });
          });
        } else {
          variant.sizes.push({
            size: 'One Size',
            stock: comb.stock,
            sku: comb.sku,
            price: comb.price,
            originalPrice: comb.originalPrice,
          });
        }
      });

      return Array.from(variantsMap.values());
    },
    [variantTypes]
  );

  // Convert variants to Shopify format
  const convertVariantsToShopifyFormat = useCallback(
    (variants: ProductVariant[]) => {
      if (variants.length === 0) return;

      const hasColors = variants.some((v) => v.colorName);
      const hasSizes = variants.some((v) => v.sizes.length > 0);

      const newTypes: VariantType[] = [];
      const newOptions: Record<string, string[]> = {};
      const newColorCodes: Record<string, Record<string, string>> = {};

      if (hasColors) {
        const colorType: VariantType = {
          id: 'type-color',
          name: 'Color',
          isColor: true,
        };
        newTypes.push(colorType);
        const colors = [...new Set(variants.map((v) => v.colorName))];
        newOptions[colorType.id] = colors;
        newColorCodes[colorType.id] = {};
        variants.forEach((v) => {
          if (v.colorCode) {
            newColorCodes[colorType.id][v.colorName] = v.colorCode;
          }
        });
      }

      if (hasSizes) {
        const sizeType: VariantType = {
          id: 'type-size',
          name: 'Size',
          isColor: false,
        };
        newTypes.push(sizeType);
        const sizes = new Set<string>();
        variants.forEach((v) => {
          v.sizes.forEach((s) => sizes.add(s.size));
        });
        newOptions[sizeType.id] = Array.from(sizes);
      }

      setVariantTypes(newTypes);
      setVariantOptions(newOptions);
      setVariantColorCodes(newColorCodes);

      const combinations: VariantCombination[] = [];
      variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          const options: VariantOption[] = [];
          if (hasColors) {
            options.push({
              typeId: 'type-color',
              typeName: 'Color',
              value: variant.colorName,
              colorCode: variant.colorCode,
            });
          }
          if (hasSizes) {
            options.push({
              typeId: 'type-size',
              typeName: 'Size',
              value: size.size,
            });
          }
          combinations.push({
            id: `comb-${Date.now()}-${Math.random()}`,
            options,
            sku: size.sku,
            price: size.price || variant.price,
            originalPrice: size.originalPrice || variant.originalPrice,
            stock: size.stock,
            images: variant.images,
          });
        });
      });

      setVariantCombinations(combinations);
      setUseShopifyVariants(true);
    },
    []
  );

  // Legacy variant functions
  const addVariant = useCallback(() => {
    setVariants((prev) => [
      ...prev,
      {
        colorName: '',
        colorCode: '#000000',
        price: basePrice || 0,
        originalPrice: baseOriginalPrice || 0,
        images: [],
        sizes: [],
      },
    ]);
  }, [basePrice, baseOriginalPrice]);

  const updateVariant = useCallback((index: number, field: keyof ProductVariant, value: any) => {
    setVariants((prev) => {
      const newVariants = [...prev];
      newVariants[index] = { ...newVariants[index], [field]: value };
      return newVariants;
    });
  }, []);

  const removeVariant = useCallback((index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addVariantSize = useCallback(
    (variantIndex: number) => {
      setVariants((prev) => {
        const newVariants = [...prev];
        const variant = newVariants[variantIndex];
        const baseSku = getBaseSku();
        const colorCode = (variant.colorName || 'DEF').toUpperCase().slice(0, 3).replace(/[^A-Z0-9]/g, '') || 'DEF';
        const tempSku = `${baseSku}-${colorCode}-NEW`;

        newVariants[variantIndex] = {
          ...variant,
          sizes: [
            ...variant.sizes,
            {
              size: '',
              stock: 0,
              sku: tempSku,
              price: variant.price,
              originalPrice: variant.originalPrice,
            },
          ],
        };
        return newVariants;
      });
    },
    [getBaseSku]
  );

  const updateVariantSize = useCallback(
    (variantIndex: number, sizeIndex: number, field: string, value: any) => {
      setVariants((prev) => {
        const newVariants = [...prev];
        const variant = newVariants[variantIndex];
        const newSizes = [...variant.sizes];
        newSizes[sizeIndex] = { ...newSizes[sizeIndex], [field]: value };
        newVariants[variantIndex] = { ...variant, sizes: newSizes };
        return newVariants;
      });
    },
    []
  );

  const removeVariantSize = useCallback((variantIndex: number, sizeIndex: number) => {
    setVariants((prev) => {
      const newVariants = [...prev];
      const variant = newVariants[variantIndex];
      variant.sizes = variant.sizes.filter((_, i) => i !== sizeIndex);
      return newVariants;
    });
  }, []);

  const regenerateAllSkusLegacy = useCallback(() => {
    const baseSku = getBaseSku();
    const usedSkus = new Set<string>();
    setVariants((prev) =>
      prev.map((variant) => {
        const newSizes = variant.sizes.map((size) => {
          if (!size.size || !size.size.trim()) {
            return size;
          }
          let newSku = generateSkuForSize(baseSku, variant.colorName, size.size);
          let counter = 1;
          while (usedSkus.has(newSku)) {
            newSku = `${generateSkuForSize(baseSku, variant.colorName, size.size)}-${counter++}`.slice(0, 48);
          }
          usedSkus.add(newSku);
          return { ...size, sku: newSku };
        });
        return { ...variant, sizes: newSizes };
      })
    );
  }, [getBaseSku, generateSkuForSize]);

  const regenerateVariantSkus = useCallback(
    (variantIndex: number) => {
      const baseSku = getBaseSku();
      const usedSkus = new Set<string>();
      setVariants((prev) => {
        const newVariants = [...prev];
        const variant = newVariants[variantIndex];
        const newSizes = variant.sizes.map((size) => {
          if (!size.size || !size.size.trim()) {
            return size;
          }
          let newSku = generateSkuForSize(baseSku, variant.colorName, size.size);
          let counter = 1;
          while (usedSkus.has(newSku)) {
            newSku = `${generateSkuForSize(baseSku, variant.colorName, size.size)}-${counter++}`.slice(0, 48);
          }
          usedSkus.add(newSku);
          return { ...size, sku: newSku };
        });
        newVariants[variantIndex] = { ...variant, sizes: newSizes };
        return newVariants;
      });
    },
    [getBaseSku, generateSkuForSize]
  );

  return {
    // Shopify-style state
    variantTypes,
    variantOptions,
    variantColorCodes,
    variantCombinations,
    useShopifyVariants,
    newVariantTypeName,
    newOptionInputs,

    // Shopify-style actions
    setUseShopifyVariants,
    setNewVariantTypeName,
    setNewOptionInputs,
    addVariantType,
    removeVariantType,
    addVariantOption,
    removeVariantOption,
    updateVariantCombination,
    regenerateAllSkus,
    generateVariantCombinations,
    convertCombinationsToVariants,
    convertVariantsToShopifyFormat,

    // Legacy variant state
    variants,
    setVariants,
    addVariant,
    updateVariant,
    removeVariant,
    addVariantSize,
    updateVariantSize,
    removeVariantSize,
    regenerateAllSkusLegacy,
    regenerateVariantSkus,
  };
};

