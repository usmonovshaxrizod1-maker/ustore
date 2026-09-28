export function productVariants(product) {
  return Array.isArray(product?.variants) ? product.variants : [];
}

export function hasProductImage(product) {
  return typeof product?.img === 'string' && product.img.trim().length > 0;
}

export function canonicalFallbackVariant(product) {
  if (hasProductImage(product)) return null;
  return productVariants(product).find((variant) => variant?.img || variant?.colorImg) || null;
}

export function colorGroupsForProduct(product) {
  const groups = [];
  const seen = new Map();
  for (const variant of productVariants(product)) {
    if (!variant?.color) continue;
    if (!seen.has(variant.color)) {
      const group = { name: variant.color, img: variant.colorImg || variant.img || '' };
      seen.set(variant.color, group);
      groups.push(group);
    } else if (!seen.get(variant.color).img && (variant.colorImg || variant.img)) {
      seen.get(variant.color).img = variant.colorImg || variant.img;
    }
  }
  return groups;
}

export function defaultVariantSelection(product) {
  const variants = productVariants(product);
  if (!variants.length) return { color: null, size: null, variant: null };
  const firstColor = variants.find((variant) => variant.color)?.color || null;
  if (firstColor === null) return { color: null, size: null, variant: null };
  const sameColor = variants.filter((variant) => variant.color === firstColor);
  const firstAvailable = sameColor.find((variant) => Number(variant.qty ?? variant.stock) > 0) || sameColor[0] || null;
  return { color: firstColor, size: firstAvailable?.size || null, variant: firstAvailable };
}

export function findVariant(product, size, color) {
  return productVariants(product).find((variant) => (variant.size || null) === (size || null) && (variant.color || null) === (color || null)) || null;
}

export function variantPrice(product, size, color) {
  const variant = findVariant(product, size, color);
  const raw = variant?.price;
  const parsed = raw !== undefined && raw !== null ? Number(raw) : null;
  return parsed !== null && Number.isFinite(parsed) ? parsed : Number(product?.price) || 0;
}

export function variantOldPrice(product, size, color) {
  const variant = findVariant(product, size, color);
  const raw = variant?.oldPrice ?? variant?.old_price;
  const parsed = raw !== undefined && raw !== null ? Number(raw) : null;
  if (parsed !== null && Number.isFinite(parsed)) return parsed;
  return Number(product?.old_price ?? product?.oldPrice) || 0;
}

export function variantQty(product, size, color) {
  const variant = findVariant(product, size, color);
  if (variant) return Number(variant.qty ?? variant.stock) || 0;
  return Number(product?.stock) || 0;
}

export function variantDisplayImage(product, size, color, fallback = '') {
  const sameColor = productVariants(product).filter((variant) => (variant.color || null) === (color || null));
  const colorImage = sameColor.find((variant) => variant.colorImg)?.colorImg || sameColor.find((variant) => variant.img)?.img || null;
  if (colorImage) return colorImage;
  if (hasProductImage(product)) return product.img;
  const fallbackVariant = canonicalFallbackVariant(product);
  return fallbackVariant?.colorImg || fallbackVariant?.img || fallback;
}

export function createVariantSelection(product, initial = defaultVariantSelection(product)) {
  let color = initial?.color ?? null;
  let size = initial?.size ?? null;

  function selectColor(nextColor) {
    const candidates = productVariants(product).filter((variant) => variant.color === nextColor);
    if (!candidates.length) return snapshot();
    const sameSize = candidates.find((variant) => variant.size === size && Number(variant.qty ?? variant.stock) > 0)
      || candidates.find((variant) => variant.size === size);
    const next = sameSize || candidates.find((variant) => Number(variant.qty ?? variant.stock) > 0) || candidates[0];
    color = nextColor;
    size = next?.size || null;
    return snapshot();
  }

  function selectSize(nextSize) {
    const match = findVariant(product, nextSize, color);
    if (match) size = nextSize;
    return snapshot();
  }

  function snapshot() {
    const variant = findVariant(product, size, color);
    const variants = productVariants(product);
    const selected = variant || (variants.length ? null : null);
    return {
      color,
      size,
      variant: selected,
      price: selected ? variantPrice(product, size, color) : Number(product?.price) || 0,
      oldPrice: selected ? variantOldPrice(product, size, color) : Number(product?.old_price ?? product?.oldPrice) || 0,
      stock: selected ? variantQty(product, size, color) : Number(product?.stock) || 0,
      image: selected ? variantDisplayImage(product, size, color) : (product?.img || canonicalFallbackVariant(product)?.colorImg || canonicalFallbackVariant(product)?.img || ''),
      sku: selected?.sku || product?.sku || null,
      canAdd: variants.length ? Boolean(selected && variantQty(product, size, color) > 0) : Number(product?.stock) > 0,
    };
  }

  return { getState: snapshot, selectColor, selectSize };
}
