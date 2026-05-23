'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Banner {
    id: string;
    title: string;
    subtitle?: string;
    background_color: string;
    text_color: string;
    button_text?: string;
    button_url?: string;
}

export default function AnnouncementBar() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        fetchBanners();
    }, []);

    useEffect(() => {
        if (banners.length > 1) {
            const interval = setInterval(() => {
                setCurrentIndex((prev) => (prev + 1) % banners.length);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [banners.length]);

    const fetchBanners = async () => {
        let foundBanners: Banner[] = [];

        // Try the banners table first
        try {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('banners')
                .select('*')
                .eq('is_active', true)
                .eq('position', 'top')
                .or(`start_date.is.null,start_date.lte.${now}`)
                .or(`end_date.is.null,end_date.gte.${now}`)
                .order('sort_order', { ascending: true });

            if (!error && data && data.length > 0) {
                foundBanners = data;
            }
        } catch { /* banners table may not exist */ }

        // Fallback: read simple announcement from site_settings (CMS)
        if (foundBanners.length === 0) {
            try {
                const { data, error } = await supabase
                    .from('site_settings')
                    .select('key, value')
                    .in('key', ['announcement_text', 'announcement_active', 'announcement_bg_color', 'announcement_text_color', 'announcement_link']);

                if (!error && data && data.length > 0) {
                    const map: Record<string, string> = {};
                    data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });

                    if (map.announcement_active === 'true' && map.announcement_text) {
                        foundBanners = [{
                            id: 'cms-announcement',
                            title: map.announcement_text,
                            background_color: map.announcement_bg_color || '#171717',
                            text_color: map.announcement_text_color || '#ffffff',
                            button_url: map.announcement_link || undefined,
                        }];
                    }
                }
            } catch { /* site_settings table may not exist */ }
        }

        setBanners(foundBanners);
    };

    if (dismissed || banners.length === 0) {
        return null;
    }

    const currentBanner = banners[currentIndex % banners.length];

    const content = (
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-4">
            <p className="font-medium">
                {currentBanner.title}
                {currentBanner.subtitle && (
                    <span className="opacity-90 ml-2">{currentBanner.subtitle}</span>
                )}
            </p>

            {currentBanner.button_text && currentBanner.button_url && (
                <Link
                    href={currentBanner.button_url}
                    className="px-3 py-1 rounded-none text-[10px] uppercase tracking-widest font-semibold transition-opacity hover:opacity-80 border border-transparent hover:border-current"
                    style={{
                        backgroundColor: currentBanner.text_color,
                        color: currentBanner.background_color,
                    }}
                >
                    {currentBanner.button_text}
                </Link>
            )}
        </div>
    );

    return (
        <div
            className="py-2 px-4 text-center text-sm relative"
            style={{
                backgroundColor: currentBanner.background_color,
                color: currentBanner.text_color,
            }}
        >
            {currentBanner.button_url && !currentBanner.button_text ? (
                <Link href={currentBanner.button_url} className="block">{content}</Link>
            ) : content}

            <button
                onClick={() => setDismissed(true)}
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: currentBanner.text_color }}
                aria-label="Dismiss banner"
            >
                <i className="ri-close-line"></i>
            </button>

            {banners.length > 1 && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex gap-1">
                    {banners.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-1.5 h-1.5 rounded-none transition-opacity ${idx === currentIndex % banners.length ? 'opacity-100' : 'opacity-40'}`}
                            style={{ backgroundColor: currentBanner.text_color }}
                            aria-label={`Go to banner ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
