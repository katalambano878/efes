export type HeroSlide = {
  image: string;
  /**
   * Optional background video URL (mp4/webm/mov). When set, the storefront
   * renders an autoplaying, muted, looping video instead of the still image.
   * The `image` field is still used as the poster while the video loads
   * and as a fallback if the browser can't play it.
   */
  video?: string;
  tagline: string;
  headline: string;
  subheadline: string;
  primaryButtonText: string;
  primaryButtonLink: string;
};

export type HeroBannerConfig = {
  slides: HeroSlide[];
  secondaryButtonText: string;
  secondaryButtonLink: string;
};

export const HERO_SLIDES_JSON_KEY = 'hero_slides_json';

export const DEFAULT_HERO_BANNER_CONFIG: HeroBannerConfig = {
  secondaryButtonText: 'Our Story',
  secondaryButtonLink: '/about',
  slides: [
    {
      image: '/hero0.png',
      tagline: 'Visit Our Boutique',
      headline: 'Style Meets Quality',
      subheadline:
        'Step into our curated space at Dansoman Sahara. Discover vibrant collections in an inviting, beautifully lit environment.',
      primaryButtonText: 'Shop Now',
      primaryButtonLink: '/shop',
    },
    {
      image: '/hero1.png',
      tagline: 'The New Standard',
      headline: 'Elevate Your Wardrobe',
      subheadline: 'Discover uncompromising quality and timeless elegance at our Dansoman Sahara boutique.',
      primaryButtonText: 'Explore Collection',
      primaryButtonLink: '/shop',
    },
    {
      image: '/hero2.png',
      tagline: 'Curated Elegance',
      headline: 'Welcome to Efescloset',
      subheadline:
        'Where exceptional craftsmanship meets contemporary fashion tailored for your unique lifestyle.',
      primaryButtonText: 'View Collections',
      primaryButtonLink: '/categories',
    },
    {
      image: '/hero3.jpeg',
      tagline: 'Trending Now',
      headline: 'Define Your Signature Style',
      subheadline:
        'Every piece tells a story. Find the perfect statement for your next unforgettable moment with our exclusive new arrivals.',
      primaryButtonText: 'Shop Now',
      primaryButtonLink: '/shop',
    },
  ],
};

function isHeroSlide(x: unknown): x is HeroSlide {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const videoOk = o.video === undefined || typeof o.video === 'string';
  return (
    typeof o.image === 'string' &&
    videoOk &&
    typeof o.tagline === 'string' &&
    typeof o.headline === 'string' &&
    typeof o.subheadline === 'string' &&
    typeof o.primaryButtonText === 'string' &&
    typeof o.primaryButtonLink === 'string'
  );
}

export function parseHeroBannerConfig(raw: string | null | undefined): HeroBannerConfig {
  const fallback = DEFAULT_HERO_BANNER_CONFIG;
  if (!raw || !raw.trim()) return { ...fallback, slides: [...fallback.slides] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { ...fallback, slides: [...fallback.slides] };

    const obj = parsed as Record<string, unknown>;
    const slidesRaw = obj.slides;
    if (!Array.isArray(slidesRaw) || slidesRaw.length === 0) {
      return { ...fallback, slides: [...fallback.slides] };
    }

    const slides = slidesRaw.filter(isHeroSlide);
    if (slides.length === 0) return { ...fallback, slides: [...fallback.slides] };

    const secondaryButtonText =
      typeof obj.secondaryButtonText === 'string' ? obj.secondaryButtonText : fallback.secondaryButtonText;
    const secondaryButtonLink =
      typeof obj.secondaryButtonLink === 'string' ? obj.secondaryButtonLink : fallback.secondaryButtonLink;

    return {
      slides,
      secondaryButtonText,
      secondaryButtonLink,
    };
  } catch {
    return { ...fallback, slides: [...fallback.slides] };
  }
}

export function emptyHeroSlide(): HeroSlide {
  return {
    image: '/hero0.png',
    video: '',
    tagline: '',
    headline: '',
    subheadline: '',
    primaryButtonText: 'Shop Now',
    primaryButtonLink: '/shop',
  };
}
