import { useEffect } from 'react';

/**
 * useSEO Hook
 * @param {Object} seo - SEO metadata
 * @param {string} seo.title - Page title
 * @param {string} seo.description - Meta description
 * @param {string} seo.keywords - Meta keywords
 * @param {string} seo.path - Canonical path
 */
export function useSEO({ title, description, keywords, path }) {
  useEffect(() => {
    // Title
    const fullTitle = `${title} | Botnoob`;
    document.title = fullTitle;

    // Meta Tags
    const updateMeta = (name, content, attr = 'name') => {
      let meta = document.querySelector(`meta[${attr}="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    if (description) {
      updateMeta('description', description);
      updateMeta('og:description', description, 'property');
      updateMeta('twitter:description', description);
    }

    if (keywords) {
      updateMeta('keywords', keywords);
    }

    updateMeta('og:title', fullTitle, 'property');
    updateMeta('twitter:title', fullTitle);

    // Canonical
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', `https://new.tg${path || ''}`);

  }, [title, description, keywords, path]);
}
