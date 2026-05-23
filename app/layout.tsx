import type { Metadata } from "next";
import Script from "next/script";
import { Pacifico, Playfair_Display, Inter } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import "./globals.css";

const pacifico = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-pacifico" });
const playfair = Playfair_Display({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-playfair",
});
const inter = Inter({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
});

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://efescloset.com').replace(/\/+$/, '');
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} | Online Store`,
    template: `%s | ${siteName}`
  },
  description: "Style meets quality. Efescloset — trusted clothing brand in Ghana. Shop quality fashion online with nationwide delivery. Visit us at Dansoman Sahara bus stop, Monday–Saturday 8am–8pm.",
  keywords: [
    "Efescloset",
    "clothing store Ghana",
    "online shopping Ghana",
    "fashion Accra",
    "Dansoman fashion",
    "buy clothes online Ghana",
    "quality clothing Ghana",
    "affordable fashion",
    "trusted clothing brand",
    "Ghana ecommerce",
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/logo-efes.png', sizes: 'any', type: 'image/png' },
    ],
    apple: [
      { url: '/logo-efes.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteName,
  },
  formatDetection: {
    telephone: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  openGraph: {
    type: "website",
    locale: "en_GH",
    url: siteUrl,
    title: `${siteName} | Style Meets Quality`,
    description: "Style meets quality. Efescloset — trusted clothing brand in Ghana. Shop fashion online with nationwide delivery.",
    siteName,
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: `${siteName} - Style meets quality`,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Style Meets Quality`,
    description: "Style meets quality. Efescloset — trusted clothing brand in Ghana. Shop fashion online with nationwide delivery.",
    images: [`${siteUrl}/opengraph-image`],
  },
  alternates: {
    canonical: siteUrl,
  },
};

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// Google reCAPTCHA v3 Site Key
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#171717" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={siteName} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#171717" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/logo-efes.png" />
        <link rel="icon" type="image/png" href="/logo-efes.png" />

        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css"
          rel="stylesheet"
        />

        {/* Structured Data - Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": siteName,
              "url": siteUrl,
              "logo": `${siteUrl}/logo-efes.png`,
              "description": "Your trusted online store.",
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "GH",
                "addressLocality": process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Your address"
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "contactType": "customer service",
                "telephone": process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
                "availableLanguage": "English"
              }
            })
          }}
        />
      </head>

      {/* Google Analytics */}
      {GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                page_path: window.location.pathname,
              });
            `}
          </Script>
        </>
      )}

      {/* Google reCAPTCHA v3 */}
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      )}

      <body className={`antialiased overflow-x-hidden pwa-body ${pacifico.variable} ${playfair.variable} ${inter.variable} font-sans`} style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[10000] focus:px-6 focus:py-3 focus:bg-gray-900 focus:text-white focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <CartProvider>
          <WishlistProvider>
            <div id="main-content">
              {children}
            </div>
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
