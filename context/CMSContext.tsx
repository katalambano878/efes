'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface SiteSettings {
    site_name: string;
    site_tagline: string;
    site_logo: string;
    contact_email: string;
    contact_phone: string;
    contact_address: string;
    social_facebook: string;
    social_instagram: string;
    social_twitter: string;
    primary_color: string;
    secondary_color: string;
    currency: string;
    currency_symbol: string;
    [key: string]: string;
}

interface CMSContent {
    id: string;
    section: string;
    block_key: string;
    title: string | null;
    subtitle: string | null;
    content: string | null;
    image_url: string | null;
    button_text: string | null;
    button_url: string | null;
    metadata: Record<string, any>;
    is_active: boolean;
}

interface Banner {
    id: string;
    name: string;
    type: string;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    background_color: string;
    text_color: string;
    button_text: string | null;
    button_url: string | null;
    is_active: boolean;
    position: string;
    start_date: string | null;
    end_date: string | null;
}

interface CMSContextType {
    settings: SiteSettings;
    content: CMSContent[];
    banners: Banner[];
    loading: boolean;
    getContent: (section: string, blockKey: string) => CMSContent | undefined;
    getSetting: (key: string) => string;
    getActiveBanners: (position?: string) => Banner[];
    refreshCMS: () => Promise<void>;
}

const defaultSettings: SiteSettings = {
    site_name: 'Efescloset',
    site_tagline: 'Style meets quality.',
    site_logo: '/logo.png',
    contact_email: 'contact@efescloset.com',
    contact_phone: '0550398805',
    contact_address: 'Dansoman Sahara bus stop',
    social_facebook: '',
    social_instagram: 'https://instagram.com/efescloset1',
    social_twitter: '',
    social_tiktok: 'https://tiktok.com/@MSs_____efe',
    social_snapchat: 'https://snapchat.com/add/feli_wiafe2021',
    social_whatsapp: '0272712187',
    primary_color: '#059669',
    secondary_color: '#0D9488',
    currency: 'GHS',
    currency_symbol: 'GH₵',
};

const CMSContext = createContext<CMSContextType>({
    settings: defaultSettings,
    content: [],
    banners: [],
    loading: true,
    getContent: () => undefined,
    getSetting: () => '',
    getActiveBanners: () => [],
    refreshCMS: async () => { },
});

export function CMSProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SiteSettings>({
        site_name: 'Efescloset',
        site_tagline: 'Style meets quality.',
        site_logo: '/logo.png',
        contact_email: 'contact@efescloset.com',
        contact_phone: '0550398805',
        contact_address: 'Dansoman Sahara bus stop',
        social_facebook: '',
        social_instagram: 'https://instagram.com/efescloset1',
        social_twitter: '',
        social_tiktok: 'https://tiktok.com/@MSs_____efe',
        social_snapchat: 'https://snapchat.com/add/feli_wiafe2021',
        social_whatsapp: '0272712187',
        primary_color: '#FBF6F2',
        secondary_color: '#A14F57',
        currency: 'GHS',
        currency_symbol: 'GH₵',
    });
    const [content, setContent] = useState<CMSContent[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCMSData = async () => {
        try {
            const { data, error } = await supabase
                .from('site_settings')
                .select('key, value');

            if (error) {
                // Table may not exist yet — silently fall back to defaults
                setLoading(false);
                return;
            }

            if (data && data.length > 0) {
                const updated: Record<string, string> = {};
                data.forEach((row: { key: string; value: string }) => {
                    updated[row.key] = row.value;
                });
                setSettings(prev => ({ ...prev, ...updated }));
            }
        } catch {
            // Fall back to defaults silently
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCMSData();
    }, []);

    const getContent = (section: string, blockKey: string): CMSContent | undefined => {
        return content.find(c => c.section === section && c.block_key === blockKey);
    };

    const getSetting = (key: string): string => {
        return settings[key] || defaultSettings[key] || '';
    };

    const getActiveBanners = (position?: string): Banner[] => {
        const now = new Date();
        return banners.filter(b => {
            if (position && b.position !== position) return false;
            if (b.start_date && new Date(b.start_date) > now) return false;
            if (b.end_date && new Date(b.end_date) < now) return false;
            return b.is_active;
        });
    };

    return (
        <CMSContext.Provider
            value={{
                settings,
                content,
                banners,
                loading,
                getContent,
                getSetting,
                getActiveBanners,
                refreshCMS: fetchCMSData,
            }}
        >
            {children}
        </CMSContext.Provider>
    );
}

export function useCMS() {
    const context = useContext(CMSContext);
    if (!context) {
        throw new Error('useCMS must be used within a CMSProvider');
    }
    return context;
}

export default CMSContext;
