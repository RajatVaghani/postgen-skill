/**
 * Caption template — text directly on vivid, unprocessed background photos.
 * No overlays, no blur, no cards. Bold white text with heavy text-shadow
 * for legibility against any image. Organic, UGC-native social media feel.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

const swipeHintCssCaption = `.swipe-hint{position:absolute;bottom:55px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:20px;font-weight:800;color:#fff;letter-spacing:2px;text-transform:uppercase;text-shadow:0 2px 8px rgba(0,0,0,0.7)}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:26px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.7)}
    @keyframes swipePulse{0%,100%{opacity:0.6;transform:translateX(0)}50%{opacity:1;transform:translateX(6px)}}`;

const textShadow = '0 2px 6px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5), 0 4px 30px rgba(0,0,0,0.4)';
const subtleShadow = '0 2px 6px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.4)';

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const swipeCss = showSwipeHint ? swipeHintCssCaption : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}z-index:1}
.content{position:relative;z-index:2;padding:0 80px;text-align:center;max-width:100%}
.hook-title{font-size:88px;font-weight:900;color:#fff;line-height:1.18;text-shadow:${textShadow};letter-spacing:-1px}
.subtitle{font-size:30px;color:#fff;font-weight:600;margin-top:32px;line-height:1.5;text-shadow:${subtleShadow}}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div>
<div class="content"><div class="hook-title">${slide.title}</div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}z-index:1}
.content{position:relative;z-index:2;padding:0 80px;text-align:center;max-width:100%}
.title{font-size:72px;font-weight:900;color:#fff;line-height:1.2;text-shadow:${textShadow};margin-bottom:28px}
.body-text{font-size:34px;font-weight:600;color:#fff;line-height:1.55;text-shadow:${subtleShadow}}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div>
<div class="content"><div class="title">${slide.title}</div>
<p class="body-text">${slide.body}</p>${featuredImgHtml(featured)}</div></div>
</body></html>`;
}

export function cta(slide, brand, total, dim, bgCss, logoBase64, featured) {
  const largeLogo = logoBase64
    ? `<img src="${logoBase64}" alt="${brand.name}" class="cta-logo" />`
    : `<div class="cta-brand-name">${brand.name}</div>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:brightness(0.85);z-index:1}
.content{position:relative;z-index:2;text-align:center;padding:0 80px}
.cta-logo{width:100px;height:100px;object-fit:contain;margin-bottom:36px;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.6))}
.cta-brand-name{font-size:52px;font-weight:900;color:#fff;margin-bottom:36px;text-shadow:${textShadow}}
.cta-title{font-size:76px;font-weight:900;color:#fff;line-height:1.18;text-shadow:${textShadow};margin-bottom:28px}
.cta-body{font-size:32px;color:#fff;font-weight:600;margin-bottom:48px;line-height:1.5;text-shadow:${subtleShadow}}
.cta-button{display:inline-block;background:#fff;color:#111;font-size:26px;font-weight:800;padding:20px 56px;border-radius:60px;letter-spacing:1px;box-shadow:0 6px 24px rgba(0,0,0,0.4);margin-bottom:24px}
.website{font-size:24px;color:#fff;font-weight:700;text-shadow:${subtleShadow}}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div>
<div class="content">${largeLogo}<div class="cta-title">${slide.title}</div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
<div class="cta-button">Learn More</div>
${brand.website ? `<p class="website">${brand.website}</p>` : ''}</div></div>
</body></html>`;
}
