'use client';

import { useEffect } from 'react';

const SITE_NAME = 'Efescloset';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | Style meets quality`;
  }, [title]);
}
