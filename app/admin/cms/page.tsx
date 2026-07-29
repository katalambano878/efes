'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImageForUpload } from '@/lib/client-image';
import {
  DEFAULT_HERO_BANNER_CONFIG,
  HERO_SLIDES_JSON_KEY,
  parseHeroBannerConfig,
  emptyHeroSlide,
  type HeroBannerConfig,
} from '@/lib/hero-slides';

type Tab = 'settings' | 'announcement' | 'hero' | 'social';

interface SettingsMap {
  [key: string]: string;
}

const DEFAULT_SETTINGS: SettingsMap = {
  site_name: 'Efescloset',
  site_tagline: 'Style meets quality.',
  contact_email: 'contact@efescloset.com',
  contact_phone: '0550398805',
  contact_address: 'Dansoman Sahara bus stop',
  currency: 'GHS',
  currency_symbol: 'GH₵',
  social_instagram: '',
  social_tiktok: 'https://tiktok.com/@MSs_____efe',
  social_snapchat: 'https://snapchat.com/add/feli_wiafe2021',
  social_facebook: '',
  social_twitter: '',
  social_whatsapp: '0272712187',
  announcement_text: '',
  announcement_active: 'false',
  announcement_bg_color: '#171717',
  announcement_text_color: '#ffffff',
  announcement_link: '',
};

export default function CMSPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [settings, setSettings] = useState<SettingsMap>({ ...DEFAULT_SETTINGS });
  const [heroConfig, setHeroConfig] = useState<HeroBannerConfig>(() => ({
    slides: [...DEFAULT_HERO_BANNER_CONFIG.slides],
    secondaryButtonText: DEFAULT_HERO_BANNER_CONFIG.secondaryButtonText,
    secondaryButtonLink: DEFAULT_HERO_BANNER_CONFIG.secondaryButtonLink,
  }));
  const heroHydrated = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [tableReady, setTableReady] = useState(true);
  /** Which hero slide index is currently uploading an image (null = none). */
  const [uploadingHeroSlide, setUploadingHeroSlide] = useState<number | null>(null);
  /** Which hero slide index is currently uploading a video (null = none). */
  const [uploadingHeroSlideVideo, setUploadingHeroSlideVideo] = useState<number | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value');

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableReady(false);
        }
        console.warn('Could not fetch site_settings:', error.message);
        return;
      }

      if (data && data.length > 0) {
        const fetched: SettingsMap = {};
        data.forEach((row: { key: string; value: string }) => {
          fetched[row.key] = row.value;
        });
        setSettings(prev => ({ ...prev, ...fetched }));
      }
    } catch (err) {
      console.error('Error loading CMS settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading || heroHydrated.current) return;
    const raw = settings[HERO_SLIDES_JSON_KEY];
    if (raw !== undefined && raw !== '') {
      setHeroConfig(parseHeroBannerConfig(raw));
    }
    heroHydrated.current = true;
  }, [loading, settings]);

  const updateHeroSlide = (index: number, field: keyof HeroBannerConfig['slides'][0], value: string) => {
    setHeroConfig((prev) => {
      const slides = [...prev.slides];
      if (!slides[index]) return prev;
      slides[index] = { ...slides[index], [field]: value };
      return { ...prev, slides };
    });
  };

  const addHeroSlide = () => {
    setHeroConfig((prev) => {
      if (prev.slides.length >= 8) return prev;
      return { ...prev, slides: [...prev.slides, emptyHeroSlide()] };
    });
  };

  const removeHeroSlide = (index: number) => {
    setHeroConfig((prev) => {
      if (prev.slides.length <= 1) return prev;
      return { ...prev, slides: prev.slides.filter((_, i) => i !== index) };
    });
  };

  const handleHeroSlideImageUpload = async (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPEG, PNG, WebP, etc.).');
      return;
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('Image is too large. Maximum size is 8 MB.');
      return;
    }

    setUploadingHeroSlide(slideIndex);
    try {
      const optimized = await compressImageForUpload(file);
      const formData = new FormData();
      formData.append('file', optimized);
      formData.append('bucket', 'products');

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || res.statusText || 'Upload failed');
      }
      const url = data?.url as string | undefined;
      if (!url) throw new Error('No image URL returned');

      updateHeroSlide(slideIndex, 'image', url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      alert(message);
    } finally {
      setUploadingHeroSlide(null);
    }
  };

  const handleHeroSlideVideoUpload = async (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please choose a video file (MP4, WebM, MOV).');
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('Video is too large. Maximum size is 50 MB. Tip: keep hero videos short and compressed for fast loading.');
      return;
    }

    setUploadingHeroSlideVideo(slideIndex);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'products');

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || res.statusText || 'Upload failed');
      }
      const url = data?.url as string | undefined;
      if (!url) throw new Error('No video URL returned');

      updateHeroSlide(slideIndex, 'video', url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      alert(message);
    } finally {
      setUploadingHeroSlideVideo(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');

    try {
      const mergedSettings = {
        ...settings,
        [HERO_SLIDES_JSON_KEY]: JSON.stringify(heroConfig),
      };
      const rows = Object.entries(mergedSettings).map(([key, value]) => ({
        key,
        value: value ?? '',
      }));

      const { error } = await supabase
        .from('site_settings')
        .upsert(rows, { onConflict: 'key' });

      if (error) throw error;
      setSettings((prev) => ({ ...prev, [HERO_SLIDES_JSON_KEY]: JSON.stringify(heroConfig) }));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'settings', label: 'Site Settings', icon: 'ri-settings-3-line' },
    { id: 'social', label: 'Social & Contact', icon: 'ri-links-line' },
    { id: 'announcement', label: 'Announcement Bar', icon: 'ri-megaphone-line' },
    { id: 'hero', label: 'Homepage Hero', icon: 'ri-image-line' },
  ];

  if (!tableReady) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CMS / Pages</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 mt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="ri-database-2-line text-2xl text-amber-600"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-amber-900 mb-2">Database Setup Required</h2>
              <p className="text-amber-800 mb-4">
                The <code className="bg-amber-100 px-2 py-0.5 rounded text-sm font-mono">site_settings</code> table
                doesn&apos;t exist yet. Run this SQL in your Supabase SQL Editor:
              </p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre">{`CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON site_settings
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated write" ON site_settings
  FOR ALL USING (auth.role() = 'authenticated');`}</pre>
              <button
                onClick={() => { setTableReady(true); fetchSettings(); }}
                className="mt-4 bg-amber-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors"
              >
                I&apos;ve created the table — Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CMS / Pages</h1>
          <p className="text-gray-500 mt-1">Manage your site content, settings, and appearance</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Saving...
            </>
          ) : saveStatus === 'success' ? (
            <>
              <i className="ri-check-line"></i>
              Saved!
            </>
          ) : saveStatus === 'error' ? (
            <>
              <i className="ri-error-warning-line"></i>
              Error saving
            </>
          ) : (
            <>
              <i className="ri-save-line"></i>
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className={tab.icon}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-3xl"></i>
          <p className="mt-4">Loading settings...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Site Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">General Settings</h2>
                <p className="text-sm text-gray-500">Core store identity and branding</p>
              </div>

              <div className="p-6 space-y-6">
                <FieldGroup label="Store Name" description="Displayed in the header, footer, and browser tab">
                  <input
                    type="text"
                    value={settings.site_name}
                    onChange={e => updateSetting('site_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  />
                </FieldGroup>

                <FieldGroup label="Tagline" description="Short slogan shown in the footer and meta descriptions">
                  <input
                    type="text"
                    value={settings.site_tagline}
                    onChange={e => updateSetting('site_tagline', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  />
                </FieldGroup>

                <div className="grid md:grid-cols-2 gap-6">
                  <FieldGroup label="Currency Code">
                    <input
                      type="text"
                      value={settings.currency}
                      onChange={e => updateSetting('currency', e.target.value)}
                      placeholder="GHS"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                    />
                  </FieldGroup>
                  <FieldGroup label="Currency Symbol">
                    <input
                      type="text"
                      value={settings.currency_symbol}
                      onChange={e => updateSetting('currency_symbol', e.target.value)}
                      placeholder="GH₵"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                    />
                  </FieldGroup>
                </div>
              </div>
            </div>
          )}

          {/* Social & Contact Tab */}
          {activeTab === 'social' && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Contact Information</h2>
                  <p className="text-sm text-gray-500">Shown on the Contact page, footer, and structured data for Google</p>
                </div>
                <div className="p-6 space-y-6">
                  <FieldGroup label="Email Address">
                    <input
                      type="email"
                      value={settings.contact_email}
                      onChange={e => updateSetting('contact_email', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                    />
                  </FieldGroup>
                  <div className="grid md:grid-cols-2 gap-6">
                    <FieldGroup label="Phone Number">
                      <input
                        type="text"
                        value={settings.contact_phone}
                        onChange={e => updateSetting('contact_phone', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                      />
                    </FieldGroup>
                    <FieldGroup label="WhatsApp Number">
                      <input
                        type="text"
                        value={settings.social_whatsapp}
                        onChange={e => updateSetting('social_whatsapp', e.target.value)}
                        placeholder="0272712187"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                      />
                    </FieldGroup>
                  </div>
                  <FieldGroup label="Store Address">
                    <input
                      type="text"
                      value={settings.contact_address}
                      onChange={e => updateSetting('contact_address', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Social Media Links</h2>
                  <p className="text-sm text-gray-500">Displayed in the footer. Leave empty to hide.</p>
                </div>
                <div className="p-6 space-y-6">
                  <SocialField
                    icon="ri-instagram-line"
                    label="Instagram"
                    value={settings.social_instagram}
                    onChange={v => updateSetting('social_instagram', v)}
                    placeholder="https://instagram.com/efescloset1"
                  />
                  <SocialField
                    icon="ri-tiktok-line"
                    label="TikTok"
                    value={settings.social_tiktok}
                    onChange={v => updateSetting('social_tiktok', v)}
                    placeholder="https://tiktok.com/@MSs_____efe"
                  />
                  <SocialField
                    icon="ri-snapchat-line"
                    label="Snapchat"
                    value={settings.social_snapchat || ''}
                    onChange={v => updateSetting('social_snapchat', v)}
                    placeholder="https://snapchat.com/add/feli_wiafe2021"
                  />
                  <SocialField
                    icon="ri-facebook-circle-line"
                    label="Facebook"
                    value={settings.social_facebook}
                    onChange={v => updateSetting('social_facebook', v)}
                    placeholder="https://facebook.com/yourpage"
                  />
                  <SocialField
                    icon="ri-twitter-x-line"
                    label="X (Twitter)"
                    value={settings.social_twitter}
                    onChange={v => updateSetting('social_twitter', v)}
                    placeholder="https://x.com/yourhandle"
                  />
                </div>
              </div>
            </>
          )}

          {/* Announcement Bar Tab */}
          {activeTab === 'announcement' && (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Announcement Bar</h2>
                  <p className="text-sm text-gray-500">A banner shown at the top of every page on the storefront</p>
                </div>
                <button
                  onClick={() => updateSetting('announcement_active', settings.announcement_active === 'true' ? 'false' : 'true')}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    settings.announcement_active === 'true' ? 'bg-gray-700' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
                    settings.announcement_active === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Live Preview */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
                  <div
                    className="rounded-lg py-3 px-4 text-center text-sm font-medium"
                    style={{
                      backgroundColor: settings.announcement_bg_color || '#171717',
                      color: settings.announcement_text_color || '#ffffff',
                    }}
                  >
                    {settings.announcement_text || 'Your announcement text will appear here'}
                  </div>
                </div>

                <FieldGroup label="Announcement Text">
                  <input
                    type="text"
                    value={settings.announcement_text}
                    onChange={e => updateSetting('announcement_text', e.target.value)}
                    placeholder="🚚 Free shipping on orders over GH₵200!"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  />
                </FieldGroup>

                <FieldGroup label="Link URL (optional)" description="Click the bar to go to this URL">
                  <input
                    type="text"
                    value={settings.announcement_link}
                    onChange={e => updateSetting('announcement_link', e.target.value)}
                    placeholder="/shop"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  />
                </FieldGroup>

                <div className="grid md:grid-cols-2 gap-6">
                  <FieldGroup label="Background Color">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings.announcement_bg_color || '#171717'}
                        onChange={e => updateSetting('announcement_bg_color', e.target.value)}
                        className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.announcement_bg_color}
                        onChange={e => updateSetting('announcement_bg_color', e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none font-mono text-sm"
                      />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Text Color">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings.announcement_text_color || '#ffffff'}
                        onChange={e => updateSetting('announcement_text_color', e.target.value)}
                        className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.announcement_text_color}
                        onChange={e => updateSetting('announcement_text_color', e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none font-mono text-sm"
                      />
                    </div>
                  </FieldGroup>
                </div>
              </div>
            </div>
          )}

          {/* Homepage Hero Tab */}
          {activeTab === 'hero' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Homepage hero slider</h2>
                <p className="text-sm text-gray-500">
                  Upload a photo from your device for each slide (stored in your Supabase bucket), or paste an image URL if you prefer. You can still use a site path like{' '}
                  <code className="bg-gray-100 px-1 rounded text-xs">/hero0.png</code> for files in <code className="bg-gray-100 px-1 rounded text-xs">public</code>. Click{' '}
                  <strong>Save Changes</strong> at the top, then refresh the storefront to see updates.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">Secondary button (outline)</h3>
                <p className="text-xs text-gray-500">Shown next to the main CTA on every slide. Leave text empty to hide.</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <FieldGroup label="Button label">
                    <input
                      type="text"
                      value={heroConfig.secondaryButtonText}
                      onChange={(e) =>
                        setHeroConfig((p) => ({ ...p, secondaryButtonText: e.target.value }))
                      }
                      placeholder="Our Story"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                    />
                  </FieldGroup>
                  <FieldGroup label="Button link">
                    <input
                      type="text"
                      value={heroConfig.secondaryButtonLink}
                      onChange={(e) =>
                        setHeroConfig((p) => ({ ...p, secondaryButtonLink: e.target.value }))
                      }
                      placeholder="/about"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  {heroConfig.slides.length} slide{heroConfig.slides.length !== 1 ? 's' : ''} (max 8)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addHeroSlide}
                    disabled={heroConfig.slides.length >= 8}
                    className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40"
                  >
                    <i className="ri-add-line mr-1"></i>
                    Add slide
                  </button>
                </div>
              </div>

              {heroConfig.slides.map((slide, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="text-sm font-bold text-gray-900">Slide {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeHeroSlide(i)}
                      disabled={heroConfig.slides.length <= 1}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Remove slide
                    </button>
                  </div>
                  <div className="p-6 grid lg:grid-cols-2 gap-6">
                    <div>
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                        {slide.video ? (
                          <video
                            key={slide.video}
                            src={slide.video}
                            poster={slide.image || undefined}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={slide.image || '/placeholder.svg'}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                '/logo-efes.png';
                            }}
                          />
                        )}
                        {slide.video && (
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider">
                            <i className="ri-vidicon-line" /> Video
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <p className="text-[10px] text-white/80 uppercase tracking-widest truncate">
                            {slide.tagline || 'Tagline'}
                          </p>
                          <p className="text-white font-semibold truncate">{slide.headline || 'Headline'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <FieldGroup
                        label="Slide image"
                        description="Upload from your device, or paste a URL / public path below."
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <input
                            id={`hero-slide-image-${i}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingHeroSlide === i}
                            onChange={(e) => handleHeroSlideImageUpload(i, e)}
                          />
                          <label
                            htmlFor={`hero-slide-image-${i}`}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${
                              uploadingHeroSlide === i
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                                : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'
                            }`}
                          >
                            {uploadingHeroSlide === i ? (
                              <>
                                <i className="ri-loader-4-line animate-spin" />
                                Uploading…
                              </>
                            ) : (
                              <>
                                <i className="ri-upload-2-line" />
                                Choose photo
                              </>
                            )}
                          </label>
                        </div>
                        <input
                          type="text"
                          value={slide.image}
                          onChange={(e) => updateHeroSlide(i, 'image', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          placeholder="Filled after upload, or paste URL / /hero0.png"
                        />
                      </FieldGroup>
                      <FieldGroup
                        label="Slide video (optional)"
                        description="Upload a short, muted background video (MP4 / WebM / MOV, max 50 MB). When set, it plays in place of the photo above. The photo is still used as a poster while the video loads."
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <input
                            id={`hero-slide-video-${i}`}
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/*"
                            className="hidden"
                            disabled={uploadingHeroSlideVideo === i}
                            onChange={(e) => handleHeroSlideVideoUpload(i, e)}
                          />
                          <label
                            htmlFor={`hero-slide-video-${i}`}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${
                              uploadingHeroSlideVideo === i
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                                : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {uploadingHeroSlideVideo === i ? (
                              <>
                                <i className="ri-loader-4-line animate-spin" />
                                Uploading…
                              </>
                            ) : (
                              <>
                                <i className="ri-vidicon-line" />
                                {slide.video ? 'Replace video' : 'Choose video'}
                              </>
                            )}
                          </label>
                          {slide.video && (
                            <button
                              type="button"
                              onClick={() => updateHeroSlide(i, 'video', '')}
                              className="text-sm font-medium text-red-600 hover:underline"
                            >
                              Remove video
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={slide.video || ''}
                          onChange={(e) => updateHeroSlide(i, 'video', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          placeholder="Filled after upload, or paste a video URL (e.g. /hero.mp4)"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Videos autoplay muted on loop. Keep them under ~10 seconds and compressed for fast loading on mobile.
                        </p>
                      </FieldGroup>
                      <FieldGroup label="Tagline (small caps line)">
                        <input
                          type="text"
                          value={slide.tagline}
                          onChange={(e) => updateHeroSlide(i, 'tagline', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </FieldGroup>
                      <FieldGroup label="Headline">
                        <input
                          type="text"
                          value={slide.headline}
                          onChange={(e) => updateHeroSlide(i, 'headline', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </FieldGroup>
                      <FieldGroup label="Subheadline">
                        <textarea
                          value={slide.subheadline}
                          onChange={(e) => updateHeroSlide(i, 'subheadline', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                        />
                      </FieldGroup>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <FieldGroup label="Primary button text">
                          <input
                            type="text"
                            value={slide.primaryButtonText}
                            onChange={(e) => updateHeroSlide(i, 'primaryButtonText', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </FieldGroup>
                        <FieldGroup label="Primary button link">
                          <input
                            type="text"
                            value={slide.primaryButtonLink}
                            onChange={(e) => updateHeroSlide(i, 'primaryButtonLink', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="/shop"
                          />
                        </FieldGroup>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1">{label}</label>
      {description && <p className="text-xs text-gray-400 mb-2">{description}</p>}
      {children}
    </div>
  );
}

function SocialField({ icon, label, value, onChange, placeholder }: {
  icon: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <i className={`${icon} text-xl text-gray-600`}></i>
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none text-sm"
        />
      </div>
    </div>
  );
}
