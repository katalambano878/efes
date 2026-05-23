'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import AnnouncementBar from './AnnouncementBar';
import SearchSuggestionsList, { type SearchSuggestionItem } from './SearchSuggestionsList';

const NavLink = ({ href, children, isMobile, onClick }: { href: string; children: React.ReactNode; isMobile?: boolean, onClick?: () => void }) => {
  if (isMobile) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className="block px-6 py-4 text-sm font-medium tracking-widest uppercase text-gray-600 hover:text-black hover:bg-gray-50 rounded-none transition-colors border-b border-gray-50"
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="relative group px-1 py-4 text-xs font-semibold tracking-[0.15em] uppercase text-gray-500 hover:text-black transition-colors"
    >
      <span className="relative z-10">{children}</span>
      <span className="absolute bottom-3 left-1/2 w-0 h-[1px] bg-black transition-all duration-300 ease-out group-hover:w-full group-hover:left-0"></span>
    </Link>
  );
};
export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'StandardStore';
  const currencySymbol = getSetting('currency_symbol') || 'GH₵';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Wishlist logic
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };

    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    // Auth logic
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 280);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const shouldLoadSuggestions =
    debouncedSearch.length >= 1 && (desktopSearchFocused || isSearchOpen);

  useEffect(() => {
    if (!shouldLoadSuggestions) {
      setSearchSuggestions([]);
      return;
    }

    const ac = new AbortController();
    setSearchSuggestionsLoading(true);

    fetch(`/api/storefront/search-suggestions?q=${encodeURIComponent(debouncedSearch)}`, {
      signal: ac.signal,
    })
      .then((res) => res.json())
      .then((data: { products?: SearchSuggestionItem[] }) => {
        if (!ac.signal.aborted) setSearchSuggestions(Array.isArray(data.products) ? data.products : []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setSearchSuggestions([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setSearchSuggestionsLoading(false);
      });

    return () => ac.abort();
  }, [debouncedSearch, shouldLoadSuggestions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <AnnouncementBar />

      <header
        className={`sticky top-0 z-50 pwa-header transition-all duration-500 ease-in-out border-b ${isScrolled
            ? 'bg-white border-gray-100 py-3 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]'
            : 'bg-white border-transparent py-5'
          }`}
      >
        <div className="safe-area-top" />
        <nav aria-label="Main navigation">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between">

              {/* Left Side: Mobile Menu & Logo */}
              <div className="flex items-center gap-4 flex-1 lg:flex-none">
                <button
                  className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-black rounded-none transition-colors duration-300"
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <i className="ri-menu-4-line text-2xl"></i>
                </button>
                <Link
                  href="/"
                  className="flex items-center group"
                  aria-label="Go to homepage"
                >
                  <img
                    src="/logo-efes.png"
                    alt={siteName}
                    className="h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </Link>
              </div>

              {/* Center: Desktop Navigation */}
              <div className="hidden lg:flex items-center justify-center space-x-10 flex-1">
                <NavLink href="/shop">Shop</NavLink>
                <NavLink href="/preorder">Preorder</NavLink>
                <NavLink href="/categories">Categories</NavLink>
                <NavLink href="/about">About</NavLink>
                <NavLink href="/contact">Contact</NavLink>
              </div>

              {/* Right Side: Actions */}
              <div className="flex items-center space-x-4 md:space-x-6 flex-1 justify-end">

                {/* Mobile Search Icon */}
                <button
                  className="flex items-center justify-center text-gray-500 hover:text-black transition-colors duration-300 lg:hidden group rounded-none"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Open search"
                >
                  <i className="ri-search-line text-xl transition-transform group-hover:scale-105"></i>
                </button>

                {/* Desktop Search Input + live suggestions */}
                <div className="hidden lg:block relative group">
                  <input
                    type="search"
                    placeholder="Search..."
                    className="w-48 focus:w-64 pl-0 pr-8 py-1.5 bg-transparent border-0 border-b border-gray-300 focus:border-black rounded-none transition-all duration-500 ease-out text-sm outline-none placeholder-gray-400 font-sans tracking-wide focus:ring-0"
                    aria-label="Search products"
                    aria-expanded={desktopSearchFocused && debouncedSearch.length >= 1}
                    aria-controls="header-search-suggestions"
                    aria-autocomplete="list"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setDesktopSearchFocused(true)}
                    onBlur={() => {
                      window.setTimeout(() => setDesktopSearchFocused(false), 200);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors"
                  >
                    <i className="ri-search-line text-lg"></i>
                  </button>

                  {desktopSearchFocused && debouncedSearch.length >= 1 && (
                    <div
                      id="header-search-suggestions"
                      className="absolute right-0 top-full z-[120] mt-2 w-[min(24rem,calc(100vw-2rem))]"
                    >
                      <SearchSuggestionsList
                        query={debouncedSearch}
                        items={searchSuggestions}
                        loading={searchSuggestionsLoading}
                        currencySymbol={currencySymbol}
                      />
                    </div>
                  )}
                </div>

                {/* Wishlist */}
                <Link
                  href="/wishlist"
                  className="relative flex items-center justify-center text-gray-500 hover:text-black transition-colors duration-300 group rounded-none"
                  aria-label={`Wishlist, ${wishlistCount} items`}
                >
                  <i className="ri-heart-3-line text-xl transition-transform group-hover:scale-105"></i>
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-black text-white text-[9px] font-bold rounded-none flex items-center justify-center transform scale-100 group-hover:scale-110 transition-transform">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                {/* Cart */}
                <div className="relative">
                  <button
                    className="relative flex items-center justify-center text-gray-500 hover:text-black transition-colors duration-300 group rounded-none"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={`Shopping cart, ${cartCount} items`}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-bag-line text-xl transition-transform group-hover:-translate-y-0.5 group-hover:scale-105"></i>
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-black text-white text-[9px] font-bold rounded-none flex items-center justify-center transform scale-100 group-hover:scale-110 transition-transform">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>

                {/* Account */}
                {user ? (
                  <Link
                    href="/account"
                    className="hidden lg:flex items-center justify-center text-gray-500 hover:text-black transition-colors duration-300 group rounded-none"
                    aria-label="My account"
                    title="Account"
                  >
                    <i className="ri-user-smile-line text-xl transition-transform group-hover:scale-105"></i>
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className="hidden lg:flex items-center justify-center text-gray-500 hover:text-black transition-colors duration-300 group rounded-none"
                    aria-label="Login"
                    title="Login"
                  >
                    <i className="ri-user-line text-xl transition-transform group-hover:scale-105"></i>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Global Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-white z-[100] flex items-start justify-center pt-24 transition-opacity duration-300">
          <div
            className="absolute inset-0 bg-white"
            onClick={() => setIsSearchOpen(false)}
            aria-hidden="true"
          />
          <div className="bg-white w-full max-w-4xl mx-4 relative transform animate-in fade-in slide-in-from-top-4 duration-500 rounded-none border-b border-gray-100 shadow-sm">
            <div className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-3xl font-serif tracking-wide text-black">Search Collections</h3>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="flex items-center justify-center text-gray-400 hover:text-black transition-colors duration-300 rounded-none"
                >
                  <i className="ri-close-line text-3xl"></i>
                </button>
              </div>
              <form onSubmit={handleSearch}>
                <div className="relative group">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter keyword..."
                    className="w-full px-0 py-4 pb-4 bg-transparent border-0 border-b-2 border-gray-200 focus:border-black text-xl md:text-2xl transition-colors duration-300 outline-none font-sans tracking-wide focus:ring-0 rounded-none"
                    autoFocus
                    aria-controls="mobile-search-suggestions"
                    aria-expanded={isSearchOpen && debouncedSearch.length >= 1}
                  />
                  <button
                    type="submit"
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-black hover:text-gray-500 transition-colors duration-300 rounded-none bg-transparent"
                  >
                    <i className="ri-arrow-right-line text-3xl"></i>
                  </button>
                </div>
              </form>

              {debouncedSearch.length >= 1 && (
                <div id="mobile-search-suggestions" className="mt-6">
                  <SearchSuggestionsList
                    query={debouncedSearch}
                    items={searchSuggestions}
                    loading={searchSuggestionsLoading}
                    currencySymbol={currencySymbol}
                    onPick={() => setIsSearchOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 transition-opacity duration-300 ease-linear"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-500 ease-out rounded-none">
            <div className="px-6 py-6 flex items-center justify-between bg-white relative z-10 border-b border-gray-100">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                <img src="/logo-efes.png" alt={siteName} className="h-10 w-auto object-contain" />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center text-gray-400 hover:text-black transition-colors duration-300 rounded-none"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-6 space-y-0">
              {[
                { label: 'Home', href: '/' },
                { label: 'Shop', href: '/shop' },
                { label: 'Preorder', href: '/preorder' },
                { label: 'Categories', href: '/categories' },
                { label: 'About', href: '/about' },
                { label: 'Contact', href: '/contact' },
              ].map((link, index) => (
                <div
                  key={link.href}
                  className="animate-in slide-in-from-left-4 fade-in duration-500 fill-mode-both"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <NavLink
                    href={link.href}
                    isMobile
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </NavLink>
                </div>
              ))}

              <div className="my-8 space-y-4 px-6 pt-8 border-t border-gray-100">
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('show-pwa-install-guide'));
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-3 px-0 py-4 text-sm font-bold tracking-widest uppercase text-white bg-black hover:bg-gray-800 rounded-none transition-colors border border-black"
                >
                  <i className="ri-download-cloud-2-line text-lg"></i>
                  Install App
                </button>
              </div>

              <div className="space-y-0 pt-0">
                {[
                  { label: 'Track Order', href: '/order-tracking', icon: 'ri-truck-line' },
                  { label: 'Wishlist', href: '/wishlist', icon: 'ri-heart-line' },
                  { label: 'My Account', href: '/account', icon: 'ri-user-line' },
                ].map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-4 px-6 py-4 text-sm font-medium tracking-wide uppercase text-gray-500 hover:text-black hover:bg-gray-50 border-t border-gray-50 rounded-none transition-colors duration-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <i className={`${link.icon} text-lg text-gray-400`}></i>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>

            <div className="p-6 bg-white border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-center font-medium text-gray-400">
                &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}