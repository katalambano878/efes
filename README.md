# Storefront App

A Next.js e-commerce storefront with Supabase, payments (Moolre), email (Resend), and optional AI chat (Groq).

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   - Copy `.env.local` and fill in your keys (Supabase, Groq, Moolre, Resend, etc.).
   - Optional: set `NEXT_PUBLIC_SITE_NAME` for your store name (default: "My Store").
   - Optional: set `NEXT_PUBLIC_APP_URL` to your production URL.

3. **Run development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. **Create admin user** (first time)
   ```bash
   npm run create-admin
   ```
   Uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

## Customization

- **Branding:** Update site name, tagline, contact email/phone/address in `context/CMSContext.tsx` defaults or via your CMS. Set `NEXT_PUBLIC_SITE_NAME` for metadata.
- **Logo:** Place your logo at `public/logo.png` (or update references from `/logo.png` to your file).
- **Content:** Edit About, Terms, Privacy, FAQs, and shipping/returns content in the relevant pages under `app/(store)/`.

## Scripts

- `npm run dev` — Development server (port 3009)
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm run create-admin` — Create an admin user

## Tech

- Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- Supabase (auth, database, storage)
- Moolre (payments, SMS)
- Resend (email)
- Groq (optional AI chat)
