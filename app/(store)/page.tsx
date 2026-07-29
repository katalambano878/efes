'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import CategoryTileImage from '@/components/CategoryTileImage';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  DEFAULT_HERO_BANNER_CONFIG,
  HERO_SLIDES_JSON_KEY,
  parseHeroBannerConfig,
  type HeroSlide,
} from '@/lib/hero-slides';

export default function Home() {
  usePageTitle('');
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState<HeroSlide[]>(() => [...DEFAULT_HERO_BANNER_CONFIG.slides]);
  const [heroSecondary, setHeroSecondary] = useState({
    text: DEFAULT_HERO_BANNER_CONFIG.secondaryButtonText,
    link: DEFAULT_HERO_BANNER_CONFIG.secondaryButtonLink,
  });

  useEffect(() => {
    async function loadHero() {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', HERO_SLIDES_JSON_KEY)
          .maybeSingle();

        if (error || !data?.value) return;

        const cfg = parseHeroBannerConfig(data.value);
        setSlides(cfg.slides);
        setHeroSecondary({ text: cfg.secondaryButtonText, link: cfg.secondaryButtonLink });
      } catch {
        /* keep defaults */
      }
    }
    loadHero();
  }, []);

  useEffect(() => {
    setCurrentSlide((prev) => (slides.length === 0 ? 0 : prev % slides.length));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length === 0) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const config = {
    hero: {
      secondaryButtonText: heroSecondary.text,
      secondaryButtonLink: heroSecondary.link,
    },
    banners: [
      { text: '🚚 Nationwide delivery', active: false },
      { text: '✨ Style meets quality — trusted clothing brand', active: false },
      { text: '💳 Secure payments via Mobile Money & Card', active: false }
    ]
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Featured products from API (service role) so product_images always load
        const res = await fetch('/api/storefront/products?featured=true&limit=8');
        if (res.ok) {
          const productsData = await res.json();
          setFeaturedProducts(Array.isArray(productsData) ? productsData : []);
        }

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, image_url, metadata, position')
          .eq('status', 'active')
          .order('position', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true });

        if (categoriesError) {
          setCategories([]);
        } else {
          const featuredCategories = (categoriesData || []).filter(
            (cat: any) => cat.metadata?.featured === true
          );
          setCategories(featuredCategories);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  /** Avoid out-of-range index when CMS loads fewer slides than the default carousel had in memory. */
  const heroSlideCount = slides.length;
  const activeHeroIndex = heroSlideCount > 0 ? currentSlide % heroSlideCount : 0;
  const activeHero = slides[activeHeroIndex];

  const features = [
    { icon: 'ri-store-2-line', title: 'Free Store Pickup', desc: 'Pick up at our store' },
    { icon: 'ri-arrow-left-right-line', title: 'Easy Exchanges', desc: '24-hour exchanges, no refunds' },
    { icon: 'ri-customer-service-2-line', title: '24/7 Support', desc: 'Dedicated service' },
    { icon: 'ri-shield-check-line', title: 'Secure Payment', desc: 'Safe checkout' },
  ];

  const renderBanners = () => {
    const activeBanners = config.banners?.filter(b => b.active) || [];
    if (activeBanners.length === 0) return null;

    return (
      <div className="bg-gray-900 text-white py-2 overflow-hidden relative">
        <div className="flex animate-marquee whitespace-nowrap">
          {activeBanners.concat(activeBanners).map((banner, index) => (
            <span key={index} className="mx-8 text-sm font-medium tracking-wide flex items-center">
              {banner.text}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="flex-col items-center justify-between min-h-screen">
      {renderBanners()}

      {/* Hero Section - God Level Subtle Redesign */}
      <section className="relative w-full h-[90vh] min-h-[600px] overflow-hidden bg-[#0a0a0a]">
        
        {/* Cinematic Background Images with Ken Burns Effect */}
        <div className="absolute inset-0 z-0">
          {slides.map((slide, index) => {
            const hasVideo = !!(slide.video && slide.video.trim());
            const posterSrc = (slide.image && slide.image.trim()) || '/hero0.webp';
            const isActive = index === activeHeroIndex;
            return (
              <div
                key={`hero-slide-${index}-${slide.video || slide.image}`}
                className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
                  isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {hasVideo ? (
                  <video
                    key={slide.video}
                    src={slide.video}
                    poster={posterSrc}
                    className={`absolute inset-0 w-full h-full object-cover transform transition-transform duration-[10000ms] ease-out ${
                      isActive ? 'scale-105' : 'scale-100'
                    }`}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload={isActive ? 'auto' : 'metadata'}
                  />
                ) : (
                  <Image
                    src={posterSrc}
                    fill
                    className={`object-cover transform transition-transform duration-[10000ms] ease-out ${
                      isActive ? 'scale-105' : 'scale-100'
                    }`}
                    alt={`Hero Background ${index + 1}`}
                    priority={index === 0}
                    sizes="100vw"
                    quality={90}
                  />
                )}
                {/* Subtle Vignette & Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 mix-blend-multiply"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent"></div>
              </div>
            );
          })}
        </div>

        {/* Elegant Content Layout */}
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 h-full flex flex-col items-center justify-center text-center pb-16 md:pb-24">
          <div className="max-w-4xl mx-auto">
            {/* Animated Content Wrapper */}
            <div key={activeHeroIndex} className="flex flex-col items-center animate-fade-in-up" style={{ animationDuration: '1.2s' }}>
              
              {/* Tagline */}
              <div className="flex items-center justify-center space-x-4 mb-6 opacity-90">
                <span className="h-[1px] w-8 sm:w-16 bg-white/60"></span>
                <span className="font-sans text-white/90 text-xs sm:text-sm font-semibold tracking-[0.3em] uppercase">
                  {activeHero?.tagline ?? ''}
                </span>
                <span className="h-[1px] w-8 sm:w-16 bg-white/60"></span>
              </div>

              {/* Headline */}
              <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] text-white leading-[1.1] tracking-tight mb-8 drop-shadow-md">
                {activeHero?.headline ?? ''}
              </h1>

              {/* Subheadline */}
              <p className="font-sans text-lg sm:text-xl md:text-2xl text-white/90 leading-relaxed max-w-2xl mx-auto font-light mb-12 drop-shadow">
                {activeHero?.subheadline ?? ''}
              </p>

              {/* Glassmorphic Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full sm:w-auto">
                <Link 
                  href={activeHero?.primaryButtonLink ?? '/shop'} 
                  className="font-sans group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white/90 backdrop-blur-md px-12 py-4 text-base font-semibold text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 hover:bg-white hover:scale-[1.03] hover:shadow-[0_8px_40px_rgb(0,0,0,0.2)]"
                >
                  <span className="relative z-10 tracking-wide">{activeHero?.primaryButtonText ?? 'Shop Now'}</span>
                </Link>
                
                {config.hero.secondaryButtonText && (
                  <Link 
                    href={config.hero.secondaryButtonLink} 
                    className="font-sans inline-flex items-center justify-center rounded-full border border-white/40 bg-black/20 px-12 py-4 text-base font-medium text-white backdrop-blur-lg transition-all duration-300 hover:bg-black/40 hover:border-white/60 hover:scale-[1.03]"
                  >
                    <span className="tracking-wide">{config.hero.secondaryButtonText}</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Subtle Glassmorphic Slider Controls */}
        <div className="absolute bottom-6 lg:bottom-8 left-0 right-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-end">
            
            {/* Glassmorphic Counter */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-sm text-white font-sans tracking-widest text-[7px] md:text-[8px] transition-all hover:bg-white/20">
              <span className="font-semibold opacity-90">0{activeHeroIndex + 1}</span>
              <span className="w-4 h-[1px] bg-white/40"></span>
              <span className="opacity-60">0{slides.length}</span>
            </div>
            
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedSection className="flex items-end justify-between mb-12">
            <div>
              <h2 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">Shop by Category</h2>
              <p className="text-gray-600 text-lg max-w-md">Explore our carefully curated collections</p>
            </div>
            <Link href="/categories" className="hidden md:flex items-center text-gray-900 font-medium hover:text-gray-700 transition-colors">
              View All <i className="ri-arrow-right-line ml-2"></i>
            </Link>
          </AnimatedSection>

          <AnimatedGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {categories.map((category) => (
              <Link href={`/shop?category=${category.slug}`} key={category.id} className="group outline-none block">
                <div className="relative aspect-[3/4] sm:aspect-[4/5] rounded-2xl sm:rounded-[2rem] overflow-hidden bg-[#f3f3f3] shadow-sm hover:shadow-2xl transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]">
                  <CategoryTileImage
                    imageUrl={category.image_url}
                    name={category.name}
                    className="absolute inset-0 w-full h-full object-contain transform transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.02]"
                  />

                  {/* Subtle darkening for text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]" />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]" />

                  {/* Elegant text layout resting at the bottom */}
                  <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-8">
                    <div className="transform translate-y-3 group-hover:translate-y-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]">
                      <h3 className="font-serif text-2xl md:text-3xl lg:text-[1.75rem] text-white font-medium drop-shadow-sm mb-1.5 md:mb-2 leading-tight">
                        {category.name}
                      </h3>

                      <div className="overflow-hidden">
                        <div className="flex items-center gap-3 transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] delay-[50ms]">
                          <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
                            View Collection
                          </span>
                          <div className="h-[1px] w-6 sm:w-8 bg-white/70" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </AnimatedGrid>

          <div className="mt-8 text-center md:hidden">
            <Link href="/categories" className="inline-flex items-center text-gray-900 font-medium hover:text-gray-700 transition-colors">
              View All <i className="ri-arrow-right-line ml-2"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">Featured Products</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">Handpicked for you</p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-8">
              {[...Array(4)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {featuredProducts.map((product) => {
                const variants = product.product_variants || [];
                const hasVariants = variants.length > 0;
                const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
                const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
                const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

                // Extract unique colors from option2
                const colorVariants: ColorVariant[] = [];
                const seenColors = new Set<string>();
                for (const v of variants) {
                  const colorName = (v as any).option2;
                  if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                    const hex = getColorHex(colorName);
                    if (hex) {
                      seenColors.add(colorName.toLowerCase().trim());
                      colorVariants.push({ name: colorName.trim(), hex });
                    }
                  }
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.compare_at_price}
                    image={(Array.isArray(product.product_images) ? [...product.product_images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]?.url : product.product_images?.[0]?.url) || '/logo-efes.png'}
                    rating={product.rating_avg || 5}
                    reviewCount={product.review_count || 0}
                    badge={product.featured ? 'Featured' : undefined}
                    isPreorder={product.metadata?.availability_type === 'preorder'}
                    inStock={effectiveStock > 0}
                    maxStock={effectiveStock || 50}
                    moq={product.moq || 1}
                    hasVariants={hasVariants}
                    minVariantPrice={minVariantPrice}
                    colorVariants={colorVariants}
                  />
                );
              })}
            </AnimatedGrid>
          )}

          <div className="text-center mt-16">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center bg-gray-900 text-white px-10 py-4 rounded-full font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 btn-animate"
            >
              View All Products
            </Link>
          </div>
        </div>
      </section>


      {/* Trust Features */}
      <section className="py-24 relative bg-slate-50/50 border-t border-gray-100 overflow-hidden">
        {/* Subtle Decorative Background Elements */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gray-200/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-gray-100/50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 100} className="group flex flex-col items-center text-center p-8 rounded-[2rem] hover:bg-white hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] transition-all duration-500 cursor-default border border-transparent hover:border-gray-100/60 relative overflow-hidden">

                <div className="relative w-20 h-20 mb-8 flex items-center justify-center">
                  {/* Animated Background Offset Box */}
                  <div className="absolute inset-0 bg-gray-100/80 rounded-2xl transform rotate-6 group-hover:rotate-12 group-hover:scale-105 transition-all duration-500 ease-out"></div>

                  {/* Foreground Glass Container */}
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-md shadow-sm border border-white rounded-2xl transform -rotate-3 group-hover:-rotate-0 group-hover:-translate-y-2 transition-all duration-500 ease-out flex items-center justify-center z-10 overflow-hidden">
                    {/* Shine Effect inside Icon Box */}
                    <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine" />
                    <i className={`${feature.icon} text-3xl text-gray-700 group-hover:text-black transform group-hover:scale-110 transition-all duration-500 relative z-20`}></i>
                  </div>
                </div>

                <h3 className="font-serif text-[22px] font-bold text-gray-900 mb-3 tracking-tight group-hover:text-black transition-colors">{feature.title}</h3>
                <p className="text-gray-500 font-medium text-[15px] leading-relaxed group-hover:text-gray-600 transition-colors px-2">{feature.desc}</p>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
