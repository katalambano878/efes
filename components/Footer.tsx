"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';
import { useRecaptcha } from '@/hooks/useRecaptcha';

function FooterSection({ title, children }: { title: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-700 lg:border-none last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left lg:py-0 lg:cursor-default lg:mb-6"
      >
        <h4 className="font-bold text-lg text-white">{title}</h4>
        <i className={`ri-arrow-down-s-line text-gray-400 text-xl transition-transform duration-300 lg:hidden ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-6' : 'max-h-0 lg:max-h-full lg:overflow-visible'}`}>
        {children}
      </div>
    </div>
  );
}

export default function Footer() {
  const { getSetting } = useCMS();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { getToken } = useRecaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    // reCAPTCHA verification
    const isHuman = await getToken('newsletter');
    if (!isHuman) {
      setSubmitStatus('error');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitStatus('error');
        return;
      }
      setSubmitStatus('success');
      setEmail('');
      if (data?.message) {
        // keep UI simple — success state already shown
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const siteName = getSetting('site_name') || 'Efescloset';
  const siteTagline = getSetting('site_tagline') || 'Style meets quality.';
  const contactEmail = getSetting('contact_email') || '';
  const contactPhone = getSetting('contact_phone') || '';
  const socialFacebook = getSetting('social_facebook') || '';
  const socialInstagram = getSetting('social_instagram') || '';
  const socialTwitter = getSetting('social_twitter') || '';
  const socialTikTok = getSetting('social_tiktok') || '';
  const socialSnapchat = getSetting('social_snapchat') || '';
  const socialWhatsapp = getSetting('social_whatsapp') || contactPhone;
  const whatsappLink = socialWhatsapp
    ? `https://wa.me/233${socialWhatsapp.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '')}`
    : '';

  return (
    <footer className="bg-gray-900 text-white rounded-t-[2.5rem] mt-8 lg:mt-0 overflow-hidden">

      {/* Newsletter Section */}
      <div className="bg-gray-900 border-b border-gray-800 py-16 md:py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-6">
            <i className="ri-mail-line text-4xl text-gray-500"></i>
          </div>
          <h3 className="text-3xl font-serif tracking-wide mb-3 text-white">Join Our Community</h3>
          <p className="text-gray-400 mb-10 max-w-md mx-auto text-xs uppercase tracking-[0.2em] leading-relaxed">
            Get exclusive access to new arrivals and special offers.
          </p>

          <form onSubmit={handleSubmit} className="max-w-lg mx-auto relative flex flex-col md:flex-row gap-6 md:gap-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 pl-0 pr-4 py-3 bg-transparent border-0 border-b border-gray-600 rounded-none text-white placeholder-gray-500 focus:outline-none focus:ring-0 focus:border-white transition-colors text-sm font-sans tracking-wide"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-10 py-4 bg-white hover:bg-gray-200 text-black text-xs uppercase tracking-widest font-bold rounded-none transition-colors border border-white disabled:opacity-50"
            >
              {isSubmitting ? '...' : 'Join'}
            </button>
          </form>

          {submitStatus === 'success' && (
            <p className="text-gray-400 text-xs uppercase tracking-widest mt-6 animate-in fade-in slide-in-from-bottom-2">
              <i className="ri-check-line mr-2 align-middle"></i> You're on the list!
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid lg:grid-cols-4 gap-12">

          {/* Brand Column */}
          <div className="lg:col-span-1 space-y-6">
            <Link href="/" className="inline-block">
              <img src="/logo-efes.png" alt={siteName} className="h-12 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
            </Link>
            <p className="text-gray-300/90 leading-relaxed text-sm">
              {siteTagline}
            </p>

            <div className="flex gap-4 pt-2 flex-wrap">
              {[
                { link: socialInstagram, icon: 'ri-instagram-line' },
                { link: socialTikTok, icon: 'ri-tiktok-fill' },
                { link: socialSnapchat, icon: 'ri-snapchat-line' },
                { link: whatsappLink, icon: 'ri-whatsapp-line' },
                { link: socialFacebook, icon: 'ri-facebook-fill' },
                { link: socialTwitter, icon: 'ri-twitter-x-fill' },
              ].map((social, i) => social.link && (
                <a
                  key={i}
                  href={social.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-gray-700/50 rounded-full flex items-center justify-center text-gray-300 hover:bg-white hover:text-gray-900 transition-all hover:-translate-y-1"
                >
                  <i className={social.icon}></i>
                </a>
              ))}
            </div>


          </div>

          {/* Links Sections (Accordion on Mobile) */}
          <div className="lg:col-span-3 grid lg:grid-cols-3 gap-8 lg:gap-12">

            <FooterSection title="Shop">
              <ul className="space-y-4 text-gray-300/90">
                <li><Link href="/shop" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> All Products</Link></li>
                <li><Link href="/preorder" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Preorder</Link></li>
                <li><Link href="/categories" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Categories</Link></li>
                <li><Link href="/shop?sort=newest" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> New Arrivals</Link></li>
                <li><Link href="/shop?sort=bestsellers" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Best Sellers</Link></li>
              </ul>
            </FooterSection>

            <FooterSection title="Customer Care">
              <ul className="space-y-4 text-gray-300/90">
                <li><Link href="/contact" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Contact Us</Link></li>
                <li><Link href="/order-tracking" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Track My Order</Link></li>
                <li><Link href="/shipping" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Shipping Info</Link></li>
                <li><Link href="/returns" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Returns Policy</Link></li>
              </ul>
            </FooterSection>

            <FooterSection title="Company">
              <ul className="space-y-4 text-gray-300/90">
                <li><Link href="/about" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Our Story</Link></li>
                <li><Link href="/blog" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Blog</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Terms of Service</Link></li>
              </ul>
            </FooterSection>

          </div>
        </div>

        <div className="border-t border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <div className="flex gap-4 grayscale opacity-50">
            <i className="ri-visa-line text-2xl"></i>
            <i className="ri-mastercard-line text-2xl"></i>
            <i className="ri-paypal-line text-2xl"></i>
          </div>
        </div>
      </div>
    </footer>
  );
}
