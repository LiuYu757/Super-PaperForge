import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/editor/', '/admin/', '/projects/', '/settings/', '/login', '/register', '/forgot-password', '/reset-password', '/share/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
