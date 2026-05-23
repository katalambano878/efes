'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';
import ProductCard from '@/components/ProductCard';
import ProductReviews from '@/components/ProductReviews';
import { StructuredData, generateProductSchema, generateBreadcrumbSchema } from '@/components/SEOHead';
import { notFound } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { usePageTitle } from '@/hooks/usePageTitle';

// Map common color names to hex values for the swatch preview
function colorNameToHex(name: string): string {
  const map: Record<string, string> = {
    red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
    orange: '#f97316', purple: '#a855f7', pink: '#ec4899', black: '#111827',
    white: '#ffffff', gray: '#6b7280', grey: '#6b7280', brown: '#92400e',
    navy: '#1e3a5f', gold: '#d4a017', silver: '#c0c0c0', beige: '#f5f5dc',
    maroon: '#800000', teal: '#14b8a6', coral: '#ff7f50', ivory: '#fffff0',
    cream: '#fffdd0', burgundy: '#800020', lavender: '#e6e6fa', cyan: '#06b6d4',
    magenta: '#d946ef', olive: '#84cc16', peach: '#ffcba4', mint: '#98f5e1',
    rose: '#f43f5e', wine: '#722f37', charcoal: '#374151', sky: '#0ea5e9',
  };
  return map[name.toLowerCase().trim()] || '#d1d5db';
}

export default function ProductDetailClient({ slug }: { slug: string }) {
  const [product, setProduct] = useState<any>(null);
  usePageTitle(product?.name || 'Product');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);

  const { addToCart } = useCart();

  useEffect(() => {
    async function fetchProduct() {
      try {
        setLoading(true);
        // Fetch via storefront API (service role) so variants always load regardless of RLS
        let dataToTransform: any = null;
        const res = await fetch(`/api/storefront/products/${encodeURIComponent(slug)}`, {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          dataToTransform = await res.json();
        }
        if (!dataToTransform) {
          // Fallback: client Supabase (e.g. if API not available)
          const { data: fallbackData, error } = await cachedQuery<{ data: any; error: any }>(
            `product:${slug}`,
            async () => {
              let query = supabase
                .from('products')
                .select(`
                  *,
                  categories(name),
                  product_variants(*),
                  product_images(url, position, alt_text, media_type)
                `);
              const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
              if (isUUID) query = query.or(`id.eq.${slug},slug.eq.${slug}`);
              else query = query.eq('slug', slug);
              return query.single() as any;
            },
            2 * 60 * 1000
          );
          if (error || !fallbackData) {
            console.error('Error fetching product:', error);
            setLoading(false);
            return;
          }
          dataToTransform = fallbackData;
        }

        // Transform product data
        // Map variant colors from option2, and extract color_hex from metadata
        const rawVariants = (dataToTransform.product_variants || []).map((v: any) => ({
          ...v,
          color: v.option2 || '',
          colorHex: v.metadata?.color_hex || ''
        }));

        // Build a color-to-hex map from variants (prefer stored hex, fallback to colorNameToHex)
        const colorHexMap: Record<string, string> = {};
        rawVariants.forEach((v: any) => {
          if (v.color) {
            if (!colorHexMap[v.color]) {
              colorHexMap[v.color] = v.colorHex || colorNameToHex(v.color);
            }
          }
        });

        const transformedProduct = {
          ...dataToTransform,
          media: dataToTransform.product_images?.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)).map((img: any) => ({
            url: img.url,
            type: img.media_type || (/\.(mp4|mov|webm)$/i.test(img.url) ? 'video' : 'image'),
          })) || [],
          images: dataToTransform.product_images?.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)).map((img: any) => img.url) || [],
          category: dataToTransform.categories?.name || 'Shop',
          rating: dataToTransform.rating_avg || 0,
          reviewCount: 0,
          stockCount: dataToTransform.quantity,
          moq: dataToTransform.moq || 1,
          colors: [...new Set(rawVariants.map((v: any) => v.color).filter(Boolean))],
          colorHexMap,
          variants: rawVariants,
          sizes: rawVariants.map((v: any) => v.name) || [],
          features: ['Quality', 'Authentic'],
          featured: ['Quality', 'Authentic'],
          care: 'Handle with care.',
          preorderShipping: dataToTransform.metadata?.preorder_shipping || null,
          availabilityType: dataToTransform.metadata?.availability_type === 'preorder' ? 'preorder' : 'in_store',
        };

        // Ensure at least one image/placeholder
        if (transformedProduct.images.length === 0) {
          transformedProduct.images = ['https://via.placeholder.com/800x800?text=No+Image'];
        }

        setProduct(transformedProduct);

        // Set initial quantity to MOQ
        if (transformedProduct.moq > 1) {
          setQuantity(transformedProduct.moq);
        }

        // If variants exist, do NOT pre-select — force user to choose
        // Reset variant and color selection
        setSelectedVariant(null);
        setSelectedSize('');
        setSelectedColor('');

        // Fetch related products (cached for 5 minutes)
        if (dataToTransform.category_id) {
          const { data: related } = await cachedQuery<{ data: any; error: any }>(
            `related:${dataToTransform.category_id}:${dataToTransform.id}`,
            (() => supabase
              .from('products')
              .select('*, product_images(url, position), product_variants(id, name, price, quantity)')
              .eq('category_id', dataToTransform.category_id)
              .neq('id', dataToTransform.id)
              .limit(4)) as any,
            5 * 60 * 1000
          );

          if (related) {
            setRelatedProducts(related.map((p: any) => {
              const variants = p.product_variants || [];
              const hasVariants = variants.length > 0;
              const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || p.price)) : undefined;
              const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
              const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
              return {
                id: p.id,
                slug: p.slug,
                name: p.name,
                price: p.price,
                image: p.product_images?.[0]?.url || 'https://via.placeholder.com/800?text=No+Image',
                rating: p.rating_avg || 0,
                reviewCount: 0,
                inStock: effectiveStock > 0,
                maxStock: effectiveStock || 50,
                moq: p.moq || 1,
                hasVariants,
                minVariantPrice
              };
            }));
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchProduct();
    }
  }, [slug]);

  const hasVariants = product?.variants?.length > 0;
  const hasColors = product?.colors?.length > 0;
  const needsVariantSelection = hasVariants && !selectedVariant;
  const needsColorSelection = hasColors && !selectedColor;

  // Determine the active price: variant price if selected, otherwise base price
  const activePrice = selectedVariant?.price ?? product?.price ?? 0;
  const activeStock = selectedVariant ? (selectedVariant.stock ?? selectedVariant.quantity ?? product?.stockCount ?? 0) : (product?.stockCount ?? 0);

  const handleAddToCart = () => {
    if (!product) return;
    if (needsVariantSelection) return; // Safety check

    // Build variant display string: "Color / Name" or just "Name" or just "Color"
    let variantLabel: string | undefined;
    if (selectedVariant) {
      const color = selectedVariant.color || selectedColor || '';
      const name = selectedVariant.name || '';
      if (color && name) {
        variantLabel = `${color} / ${name}`;
      } else {
        variantLabel = color || name || undefined;
      }
    }

    addToCart({
      id: product.id,
      name: product.name,
      price: activePrice,
      image: selectedVariant?.image_url || product.images[0],
      quantity: quantity,
      variant: variantLabel,
      slug: product.slug,
      maxStock: activeStock,
      moq: product.moq || 1
    });
  };

  const handleBuyNow = () => {
    handleAddToCart();
    window.location.href = '/checkout';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white py-12 flex justify-center items-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-gray-900 animate-spin mb-4 block"></i>
          <p className="text-gray-500">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white py-20 flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h2>
          <Link href="/shop" className="text-gray-900 hover:underline">Return to Shop</Link>
        </div>
      </div>
    );
  }

  const discount = product.compare_at_price ? Math.round((1 - activePrice / product.compare_at_price) * 100) : 0;
  const minVariantPrice = hasVariants ? Math.min(...product.variants.map((v: any) => v.price || product.price)) : product.price;

  const productSchema = generateProductSchema({
    name: product.name,
    description: product.description,
    image: product.images[0],
    price: hasVariants ? minVariantPrice : product.price,
    currency: 'GHS',
    sku: product.sku,
    rating: product.rating,
    reviewCount: product.reviewCount,
    availability: product.quantity > 0 ? 'in_stock' : 'out_of_stock',
    category: product.category
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Shop', url: `${baseUrl}/shop` },
    { name: product.category, url: `${baseUrl}/shop?category=${product.category.toLowerCase().replace(/\s+/g, '-')}` },
    { name: product.name, url: `${baseUrl}/product/${slug}` }
  ]);

  return (
    <>
      <StructuredData data={productSchema} />
      <StructuredData data={breadcrumbSchema} />

      <main className="min-h-screen bg-white">
        <section className="py-8 bg-gray-50 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <nav className="flex items-center space-x-2 text-sm flex-wrap gap-y-2">
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">Home</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <Link href="/shop" className="text-gray-600 hover:text-gray-900 transition-colors">Shop</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <Link href="#" className="text-gray-600 hover:text-gray-900 transition-colors">{product.category}</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <span className="text-gray-900 font-medium truncate max-w-[200px]">{product.name}</span>
            </nav>
          </div>
        </section>

        <section className="py-12 lg:py-20">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
              
              {/* Product Images (Left side - scrolling) */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                {product.images.map((img: string, index: number) => {
                  const isVideo = product.media?.[index]?.type === 'video';
                  return (
                    <div key={index} className="relative aspect-[4/5] w-full bg-gray-50 overflow-hidden group">
                      {isVideo ? (
                        <video
                          src={img}
                          className="w-full h-full object-cover"
                          controls
                          muted
                          loop
                          playsInline
                          preload="none"
                        />
                      ) : (
                        <Image
                          src={img}
                          alt={`${product.name} view ${index + 1}`}
                          fill
                          className="object-cover object-center"
                          sizes="(max-width: 1024px) 100vw, 60vw"
                          priority={index === 0}
                          quality={85}
                        />
                      )}
                      
                      {/* Discount badge only on first image */}
                      {index === 0 && discount > 0 && (
                        <span className="absolute top-6 right-6 bg-black text-white text-[10px] tracking-widest uppercase font-medium px-4 py-2 z-10">
                          Save {discount}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Product Info (Right side - sticky) */}
              <div className="lg:col-span-5 relative">
                <div className="sticky top-32 flex flex-col pt-4 pb-20">
                <div className="flex items-start justify-between mb-4">
                  <div className="pr-12">
                    <p className="text-[11px] uppercase tracking-widest text-gray-500 font-medium mb-3">{product.category}</p>
                    <h1 className="text-4xl lg:text-5xl font-serif text-gray-900 mb-6 leading-[1.1]">{product.name}</h1>
                  </div>
                  <button
                    onClick={() => setIsWishlisted(!isWishlisted)}
                    className="absolute top-4 right-0 w-10 h-10 flex items-center justify-center transition-opacity hover:opacity-70 cursor-pointer text-gray-900"
                  >
                    <i className={`${isWishlisted ? 'ri-heart-fill' : 'ri-heart-line'} text-2xl`}></i>
                  </button>
                </div>

                {product.availabilityType === 'preorder' && (
                  <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold flex items-center gap-2">
                      <i className="ri-timer-line text-lg"></i>
                      Preorder — not yet in store
                    </p>
                    {product.preorderShipping ? (
                      <p className="mt-2 text-amber-900/90 leading-relaxed">{product.preorderShipping}</p>
                    ) : (
                      <p className="mt-2 text-amber-900/80">This item will ship when stock arrives. See details below or contact us for updates.</p>
                    )}
                  </div>
                )}

                <div className="flex items-baseline space-x-4 mb-8">
                  {hasVariants && !selectedVariant ? (
                    <span className="text-2xl font-light text-gray-900 tracking-tight">
                      From GH₵{minVariantPrice.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-2xl font-light text-gray-900 tracking-tight">GH₵{activePrice.toFixed(2)}</span>
                  )}
                  {product.compare_at_price && product.compare_at_price > activePrice && (
                    <span className="text-lg text-gray-400 line-through font-light tracking-tight">GH₵{product.compare_at_price.toFixed(2)}</span>
                  )}
                </div>

                <div className="prose prose-sm text-gray-600 leading-relaxed mb-10 max-w-none font-light">
                  <p>{product.description}</p>
                </div>

                {/* Color / Variant image selector: show variant image when available, else color swatch */}
                {hasVariants && product.colors.length > 0 && (
                  <div className="mb-6">
                    <label className="block font-semibold text-gray-900 mb-3">
                      Color: {selectedColor ? (
                        <span className="text-gray-900 font-normal">{selectedColor}</span>
                      ) : (
                        <span className="text-red-500 font-normal text-sm">Please select a color</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {product.colors.map((color: string) => {
                        const isSelected = selectedColor === color;
                        const colorVariants = product.variants.filter((v: any) => v.color === color);
                        const colorStock = colorVariants.reduce((sum: number, v: any) => sum + (v.stock ?? v.quantity ?? 0), 0);
                        const isOutOfStock = colorStock === 0 && product.stockCount === 0;
                        const variantImage = colorVariants.find((v: any) => v.image_url)?.image_url;
                        return (
                          <button
                            key={color}
                            onClick={() => {
                              setSelectedColor(color);
                              const matching = product.variants.filter((v: any) => v.color === color);
                              if (matching.length === 1) {
                                setSelectedVariant(matching[0]);
                                setSelectedSize(matching[0].name);
                              } else {
                                setSelectedVariant(null);
                                setSelectedSize('');
                              }
                            }}
                            disabled={isOutOfStock}
                            className={`border font-medium transition-all cursor-pointer flex items-center gap-2 overflow-hidden ${isSelected
                              ? 'border-gray-900 bg-gray-50 text-gray-900'
                              : isOutOfStock
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                : 'border-gray-200 text-gray-700 hover:border-gray-900'
                              }`}
                          >
                            {variantImage ? (
                              <span className="w-12 h-12 flex-shrink-0 overflow-hidden border-r border-gray-200 bg-gray-100">
                                <Image
                                  src={variantImage}
                                  alt={color}
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-cover"
                                />
                              </span>
                            ) : (
                              <span className="w-8 h-8 ml-2 border border-gray-200 flex-shrink-0" style={{ backgroundColor: product.colorHexMap?.[color] || colorNameToHex(color) }}></span>
                            )}
                            <span className="py-2 pr-3">{color}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size / Name Variant Selector */}
                {hasVariants && (() => {
                  // Filter variants: if colors exist and one is selected, show only matching; otherwise show all
                  const hasColors = product.colors.length > 0;
                  const visibleVariants = hasColors && selectedColor
                    ? product.variants.filter((v: any) => v.color === selectedColor)
                    : hasColors
                      ? [] // Don't show name variants until a color is picked
                      : product.variants;

                  // Check if we need to show the name selector (skip if all visible variants have the same name or only 1)
                  const uniqueNames = [...new Set(visibleVariants.map((v: any) => v.name).filter(Boolean))];
                  const showNameSelector = visibleVariants.length > 1 || (!hasColors && visibleVariants.length > 0);

                  if (!showNameSelector && !hasColors) {
                    // Single variant with no colors — show image when available, else name
                    return (
                      <div className="mb-8">
                        <label className="block font-semibold text-gray-900 mb-3">
                          Variant: {selectedVariant ? (
                            <span className="text-gray-900 font-normal">{selectedVariant.name} — GH₵{selectedVariant.price?.toFixed(2)}</span>
                          ) : (
                            <span className="text-red-500 font-normal text-sm">Please select a variant</span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {product.variants.map((variant: any) => {
                            const isSelected = selectedVariant?.id === variant.id || selectedVariant?.name === variant.name;
                            const variantStock = variant.stock ?? variant.quantity ?? 0;
                            const isOutOfStock = variantStock === 0 && product.stockCount === 0;
                            return (
                              <button
                                key={variant.id || variant.name}
                                onClick={() => {
                                  setSelectedVariant(variant);
                                  setSelectedSize(variant.name);
                                }}
                                disabled={isOutOfStock}
                                className={`border font-medium transition-all cursor-pointer flex flex-col items-center overflow-hidden min-w-[80px] ${isSelected
                                  ? 'border-gray-900 bg-gray-50 text-gray-900'
                                  : isOutOfStock
                                    ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                    : 'border-gray-200 text-gray-700 hover:border-gray-900'
                                  }`}
                              >
                                {variant.image_url ? (
                                  <span className="w-20 h-20 flex-shrink-0 overflow-hidden bg-gray-100 border-b border-gray-200">
                                    <Image src={variant.image_url} alt={variant.name} width={80} height={80} className="w-full h-full object-cover" />
                                  </span>
                                ) : (
                                  <span className="px-4 pt-3 text-center font-medium">{variant.name}</span>
                                )}
                                <span className={`px-2 pb-2 text-xs ${isSelected ? 'text-gray-700' : 'text-gray-500'}`}>
                                  GH₵{(variant.price || product.price).toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (visibleVariants.length > 1) {
                    return (
                      <div className="mb-8">
                        <label className="block font-semibold text-gray-900 mb-3">
                          Size / Type: {selectedVariant ? (
                            <span className="text-gray-900 font-normal">{selectedVariant.name} — GH₵{selectedVariant.price?.toFixed(2)}</span>
                          ) : (
                            <span className="text-red-500 font-normal text-sm">Please select</span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {visibleVariants.map((variant: any) => {
                            const isSelected = selectedVariant?.id === variant.id;
                            const variantStock = variant.stock ?? variant.quantity ?? 0;
                            const isOutOfStock = variantStock === 0 && product.stockCount === 0;
                            return (
                              <button
                                key={variant.id || variant.name}
                                onClick={() => {
                                  setSelectedVariant(variant);
                                  setSelectedSize(variant.name);
                                }}
                                disabled={isOutOfStock}
                                className={`border font-medium transition-all cursor-pointer flex flex-col items-center overflow-hidden min-w-[80px] ${isSelected
                                  ? 'border-gray-900 bg-gray-50 text-gray-900'
                                  : isOutOfStock
                                    ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                    : 'border-gray-200 text-gray-700 hover:border-gray-900'
                                  }`}
                              >
                                {variant.image_url ? (
                                  <span className="w-20 h-20 flex-shrink-0 overflow-hidden bg-gray-100 border-b border-gray-200">
                                    <Image src={variant.image_url} alt={variant.name} width={80} height={80} className="w-full h-full object-cover" />
                                  </span>
                                ) : (
                                  <span className="px-4 pt-3 text-center font-medium">{variant.name}</span>
                                )}
                                <span className={`px-2 pb-2 text-xs ${isSelected ? 'text-gray-700' : 'text-gray-500'}`}>
                                  GH₵{(variant.price || product.price).toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}

                <div className="mb-10 pb-10 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[11px] uppercase tracking-widest text-gray-900 font-medium">Quantity</span>
                    <div className="flex items-center border border-gray-300 bg-white">
                      <button
                        onClick={() => setQuantity(Math.max(product.moq || 1, quantity - 1))}
                        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                        disabled={activeStock === 0 || quantity <= (product.moq || 1)}
                      >
                        <i className="ri-subtract-line text-lg font-light"></i>
                      </button>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(product.moq || 1, Math.min(activeStock, parseInt(e.target.value) || (product.moq || 1))))}
                        className="w-12 h-10 text-center border-x border-gray-300 focus:outline-none text-sm font-medium p-0"
                        min={product.moq || 1}
                        max={activeStock}
                        disabled={activeStock === 0}
                      />
                      <button
                        onClick={() => setQuantity(Math.min(activeStock, quantity + 1))}
                        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                        disabled={activeStock === 0}
                      >
                        <i className="ri-add-line text-lg font-light"></i>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      {product.moq > 1 && (
                        <span className="text-gray-900 font-medium text-sm">
                          <i className="ri-information-line mr-1"></i>
                          Min. order: {product.moq} units
                        </span>
                      )}
                      {activeStock > 10 && (
                        <span className="text-gray-600 font-medium text-sm">
                          <i className="ri-checkbox-circle-line mr-1 text-gray-700"></i>
                          {activeStock} in stock
                        </span>
                      )}
                      {activeStock > 0 && activeStock <= 10 && (
                        <span className="text-amber-600 font-medium text-sm">
                          <i className="ri-error-warning-line mr-1"></i>
                          Only {activeStock} left in stock
                        </span>
                      )}
                      {activeStock === 0 && (
                        <span className="text-red-600 font-medium">
                          <i className="ri-close-circle-line mr-1"></i>
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full">
                  <button
                    type="button"
                    disabled={activeStock === 0 || needsVariantSelection || needsColorSelection}
                    className={`w-full sm:flex-1 min-h-0 bg-gray-900 hover:bg-black text-white py-4 border border-transparent hover:border-black uppercase tracking-[0.15em] text-[11px] font-bold transition-all duration-300 flex items-center justify-center space-x-2 whitespace-nowrap cursor-pointer shadow-sm hover:shadow-lg shrink-0 ${(activeStock === 0 || needsVariantSelection || needsColorSelection) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleAddToCart}
                  >
                    <span>{activeStock === 0 ? 'Out of Stock' : needsColorSelection ? 'Select a Color' : needsVariantSelection ? 'Select a Variant' : 'Add to Cart'}</span>
                  </button>
                  {activeStock > 0 && !needsVariantSelection && !needsColorSelection && (
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      className="w-full sm:w-[160px] sm:shrink-0 bg-white hover:bg-gray-900 hover:text-white text-gray-900 border border-gray-300 hover:border-gray-900 py-4 uppercase tracking-[0.15em] text-[11px] font-bold transition-all duration-300 whitespace-nowrap cursor-pointer"
                    >
                      Buy Now
                    </button>
                  )}
                </div>

                <div className="border-t border-gray-200 mt-10 pt-6 space-y-0">
                  <details className="group border-b border-gray-200" open>
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none py-5 text-[11px] uppercase tracking-widest text-gray-900 hover:text-gray-600 transition-colors">
                      <span>Description</span>
                      <span className="transition group-open:rotate-180">
                        <i className="ri-arrow-down-s-line text-lg"></i>
                      </span>
                    </summary>
                    <div className="text-gray-600 font-light text-sm pb-6 leading-relaxed">
                      {product.description}
                    </div>
                  </details>

                  {product.features?.length > 0 && (
                  <details className="group border-b border-gray-200">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none py-5 text-[11px] uppercase tracking-widest text-gray-900 hover:text-gray-600 transition-colors">
                      <span>Details & Fit</span>
                      <span className="transition group-open:rotate-180">
                        <i className="ri-arrow-down-s-line text-lg"></i>
                      </span>
                    </summary>
                    <div className="text-gray-600 font-light text-sm pb-6 leading-relaxed">
                      <ul className="space-y-3">
                        {product.features.map((feature: string, index: number) => (
                          <li key={index} className="flex items-start gap-3">
                            <i className="ri-check-line text-black mt-[1px]"></i>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                  )}

                  {product.care && (
                  <details className="group border-b border-gray-200">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none py-5 text-[11px] uppercase tracking-widest text-gray-900 hover:text-gray-600 transition-colors">
                      <span>Care Instructions</span>
                      <span className="transition group-open:rotate-180">
                        <i className="ri-arrow-down-s-line text-lg"></i>
                      </span>
                    </summary>
                    <div className="text-gray-600 font-light text-sm pb-6 leading-relaxed">
                      {product.care}
                    </div>
                  </details>
                  )}

                  <details className="group border-b border-gray-200">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none py-5 text-[11px] uppercase tracking-widest text-gray-900 hover:text-gray-600 transition-colors">
                      <span>Shipping & Returns</span>
                      <span className="transition group-open:rotate-180">
                        <i className="ri-arrow-down-s-line text-lg"></i>
                      </span>
                    </summary>
                    <div className="text-gray-600 font-light text-sm pb-6 leading-relaxed space-y-4">
                      <div className="flex items-center">
                        <i className="ri-store-2-line text-xl mr-3 text-gray-900"></i>
                        <span>Free store pickup available</span>
                      </div>
                      <div className="flex items-center">
                        <i className="ri-arrow-left-right-line text-xl mr-3 text-gray-900"></i>
                        <span>30-day easy returns and exchanges</span>
                      </div>
                      <div className="flex items-center">
                        <i className="ri-shield-check-line text-xl mr-3 text-gray-900"></i>
                        <span>Secure payment & buyer protection</span>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
        </section>

        <section className="py-20 border-t border-gray-100">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
            <div id="reviews" className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-serif text-gray-900 mb-10 text-center">Customer Reviews</h2>
              <ProductReviews productId={product.id} />
            </div>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="py-24 bg-gray-50" data-product-shop>
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
              <div className="flex flex-col items-center mb-16">
                <h2 className="text-3xl lg:text-4xl font-serif text-gray-900 mb-4 text-center">You May Also Like</h2>
                <div className="w-16 h-[1px] bg-gray-300"></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} {...p} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
