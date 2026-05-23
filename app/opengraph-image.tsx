import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = "Efescloset - Style meets quality";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const logoData = await readFile(
    join(process.cwd(), 'public', 'logo-efes.png'),
    'base64'
  );
  const logoSrc = `data:image/png;base64,${logoData}`;
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #171717 0%, #262626 50%, #171717 100%)',
          position: 'relative',
        }}
      >
        <img
          src={logoSrc}
          alt={siteName}
          width={280}
          height={280}
          style={{ objectFit: 'contain' }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 24,
          }}
        >
          <span
            style={{
              fontSize: 42,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.02em',
            }}
          >
            {siteName}
          </span>
          <span
            style={{
              fontSize: 20,
              color: '#a1a1aa',
              marginTop: 8,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Style meets quality
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
