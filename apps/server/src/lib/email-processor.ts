// @ts-ignore
import { CssSanitizer } from '@barkleapp/css-sanitizer';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

const sanitizer = new CssSanitizer();

interface ProcessEmailOptions {
  html: string;
  shouldLoadImages: boolean;
  theme: 'light' | 'dark';
}

// Server-side: Heavy lifting, preference-independent processing
export function preprocessEmailHtml(html: string): string {
  const sanitizeConfig: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'title',
      'details',
      'summary',
      'style',
    ]),

    allowedAttributes: {
      '*': [
        'class',
        'style',
        'align',
        'valign',
        'width',
        'height',
        'cellpadding',
        'cellspacing',
        'border',
        'bgcolor',
        'colspan',
        'rowspan',
      ],
      a: ['href', 'name', 'target', 'rel', 'class', 'style'],
      img: ['src', 'alt', 'width', 'height', 'class', 'style'],
    },

    // Allow only safe schemes - no blob for security
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'cid'],
    },

    transformTags: {
      a: (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: attribs.target || '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  };

  const sanitized = sanitizeHtml(html, sanitizeConfig);
  const $ = cheerio.load(sanitized);

  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const safe = sanitizer.sanitizeCss(css, {
      allowedProperties: [
        'color',
        'background-color',
        'font-size',
        'margin',
        'padding',
        'text-align',
        'border',
        'display',
      ],
      disallowedAtRules: ['import', 'keyframes'],
      disallowedFunctions: ['expression', 'url'],
    });
    $(el).html(safe);
  });

  // Collapse quoted text (structure only, no theme colors)
  const collapseQuoted = (selector: string) => {
    $(selector).each((_, el) => {
      const $el = $(el);
      if ($el.parents('details.quoted-toggle').length) return;

      const innerHtml = $el.html();
      if (typeof innerHtml !== 'string') return;
      const detailsHtml = `<details class="quoted-toggle" style="margin-top:1em;">
          <summary style="cursor:pointer;" data-theme-color="muted">
            Show quoted text
          </summary>
          ${innerHtml}
        </details>`;

      $el.replaceWith(detailsHtml);
    });
  };

  collapseQuoted('blockquote');
  collapseQuoted('.gmail_quote');

  // Remove unwanted elements
  $('title').remove();
  $('img[width="1"][height="1"]').remove();
  $('img[width="0"][height="0"]').remove();

  // Remove preheader content
  $('.preheader, .preheaderText, [class*="preheader"]').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    if (
      style.includes('display:none') ||
      style.includes('display: none') ||
      style.includes('font-size:0') ||
      style.includes('font-size: 0') ||
      style.includes('line-height:0') ||
      style.includes('line-height: 0') ||
      style.includes('max-height:0') ||
      style.includes('max-height: 0') ||
      style.includes('mso-hide:all') ||
      style.includes('opacity:0') ||
      style.includes('opacity: 0')
    ) {
      $el.remove();
    }
  });

  return $.html();
}

// Helper to check if a color is light (close to white)
function isLightColor(color: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase().trim();

  // Check common white/light color patterns
  if (c === 'white' || c === '#fff' || c === '#ffffff' || c === '#fefefe' || c === '#fdfdfd') {
    return true;
  }

  // Check rgb/rgba patterns
  const rgbMatch = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    // Consider light if all RGB values are above 240
    return r > 240 && g > 240 && b > 240;
  }

  // Check hex patterns
  const hexMatch = c.match(/^#([a-f0-9]{6}|[a-f0-9]{3})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return r > 240 && g > 240 && b > 240;
  }

  return false;
}

// Helper to check if a color is dark (close to black)
function isDarkColor(color: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase().trim();

  // Check common dark color patterns
  if (c === 'black' || c === '#000' || c === '#000000' || c === '#010101' || c === '#020202') {
    return true;
  }

  // Check rgb/rgba patterns
  const rgbMatch = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    // Consider dark if all RGB values are below 15
    return r < 15 && g < 15 && b < 15;
  }

  // Check hex patterns
  const hexMatch = c.match(/^#([a-f0-9]{6}|[a-f0-9]{3})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return r < 15 && g < 15 && b < 15;
  }

  return false;
}

// Extract color from inline style
function extractColorFromStyle(style: string, property: string): string | null {
  if (!style) return null;
  // Match both "color:" and "color :" patterns
  const regex = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i');
  const match = style.match(regex);
  return match ? match[1].trim() : null;
}

// Normalize color to hex format for comparison
function normalizeColor(color: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase().trim();

  // Already hex
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return '#' + hex;
  }

  // Named colors
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    blue: '#0000ff',
    red: '#ff0000',
    green: '#008000',
  };
  if (namedColors[c]) return namedColors[c];

  // RGB/RGBA
  const rgbMatch = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  }

  return null;
}

// Check if two colors are similar (for detecting same color text on background)
function areColorsSimilar(color1: string | null, color2: string | null): boolean {
  if (!color1 || !color2) return false;

  const hex1 = normalizeColor(color1);
  const hex2 = normalizeColor(color2);

  if (!hex1 || !hex2) return false;

  // Extract RGB values
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  // Calculate color difference (simple euclidean distance)
  const diff = Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
  );

  // If colors are very similar (diff < 30), they'll be hard to distinguish
  return diff < 30;
}

// Client-side: Light styling + image preferences
export function applyEmailPreferences(
  preprocessedHtml: string,
  theme: 'light' | 'dark',
  shouldLoadImages: boolean,
): { processedHtml: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false;
  const isDarkTheme = theme === 'dark';

  const $ = cheerio.load(preprocessedHtml);

  // Handle image blocking if needed
  if (!shouldLoadImages) {
    $('img').each((_, el) => {
      const $img = $(el);
      const src = $img.attr('src');

      // Allow CID images (inline attachments)
      if (src && !src.startsWith('cid:')) {
        hasBlockedImages = true;
        $img.replaceWith(`<span style="display:none;"><!-- blocked image: ${src} --></span>`);
      }
    });
  }

  // Helper to replace only text color (not background-color) in style string
  const replaceTextColor = (style: string, newColor: string): string => {
    // First, temporarily replace background-color with a placeholder
    const placeholder = '___BG_COLOR___';
    let result = style.replace(/background-color\s*:/gi, placeholder);
    // Replace the text color
    result = result.replace(/color\s*:\s*[^;]+;?/gi, `color: ${newColor};`);
    // Restore background-color
    result = result.replace(new RegExp(placeholder, 'g'), 'background-color:');
    return result;
  };

  // Fix problematic color combinations based on theme
  $('*').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style');
    if (!style) return;

    const textColor = extractColorFromStyle(style, 'color');
    const bgColor = extractColorFromStyle(style, 'background-color') || extractColorFromStyle(style, 'background');

    let newStyle = style;

    // First, check for same color text on background (e.g., blue text on blue background)
    if (textColor && bgColor && areColorsSimilar(textColor, bgColor)) {
      // Make text white on colored backgrounds, or dark on light backgrounds
      const normalizedBg = normalizeColor(bgColor);
      if (normalizedBg) {
        const r = parseInt(normalizedBg.slice(1, 3), 16);
        const g = parseInt(normalizedBg.slice(3, 5), 16);
        const b = parseInt(normalizedBg.slice(5, 7), 16);
        // Calculate luminance to decide if we need light or dark text
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const newTextColor = luminance > 0.5 ? '#1a1a1a' : '#ffffff';
        newStyle = replaceTextColor(newStyle, newTextColor);
      }
    } else if (!isDarkTheme) {
      // Light mode: Fix white/light text that won't be visible on white background
      if (textColor && isLightColor(textColor) && !bgColor) {
        newStyle = replaceTextColor(newStyle, '#1a1a1a');
      }
    } else {
      // Dark mode: Fix black/dark text that won't be visible on dark background
      if (textColor && isDarkColor(textColor) && !bgColor) {
        newStyle = replaceTextColor(newStyle, '#e5e5e5');
      }
    }

    if (newStyle !== style) {
      $el.attr('style', newStyle);
    }
  });

  // Also handle font tags with color attribute
  $('font[color]').each((_, el) => {
    const $el = $(el);
    const color = $el.attr('color');
    if (!color) return;

    if (!isDarkTheme && isLightColor(color)) {
      $el.attr('color', '#1a1a1a');
    } else if (isDarkTheme && isDarkColor(color)) {
      $el.attr('color', '#e5e5e5');
    }
  });

  const html = $.html();

  // Apply theme-specific styles
  const themeStyles = `
    <style type="text/css">
      :host {
        display: block;
        line-height: 1.5;
        background-color: ${isDarkTheme ? '#1A1A1A' : '#ffffff'};
        color: ${isDarkTheme ? '#e5e5e5' : '#1a1a1a'};
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        color: ${isDarkTheme ? '#e5e5e5' : '#1a1a1a'};
        background-color: ${isDarkTheme ? '#1A1A1A' : '#ffffff'};
      }

      /* Links styling */
      a {
        cursor: pointer;
        color: ${isDarkTheme ? '#60a5fa' : '#2563eb'};
      }

      /* Button-like links - preserve their styling */
      a[style*="background-color"],
      a[style*="background:"] {
        text-decoration: none;
      }

      table {
        border-collapse: collapse;
      }

      ::selection {
        background: #b3d4fc;
        text-shadow: none;
      }

      /* Styling for collapsed quoted text */
      details.quoted-toggle {
        border-left: 2px solid ${isDarkTheme ? '#374151' : '#d1d5db'};
        padding-left: 8px;
        margin-top: 0.75rem;
      }

      details.quoted-toggle summary {
        cursor: pointer;
        color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'};
        list-style: none;
        user-select: none;
      }

      details.quoted-toggle summary::-webkit-details-marker {
        display: none;
      }

      [data-theme-color="muted"] {
        color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'};
      }

      /* Ensure plain text emails are readable */
      pre, code {
        white-space: pre-wrap;
        word-wrap: break-word;
        color: ${isDarkTheme ? '#e5e5e5' : '#1a1a1a'};
      }
    </style>
  `;

  const finalHtml = `${themeStyles}${html}`;

  return {
    processedHtml: finalHtml,
    hasBlockedImages,
  };
}

// Original function for backward compatibility
export function processEmailHtml({ html, shouldLoadImages, theme }: ProcessEmailOptions): {
  processedHtml: string;
  hasBlockedImages: boolean;
} {
  const preprocessed = preprocessEmailHtml(html);
  return applyEmailPreferences(preprocessed, theme, shouldLoadImages);
}
