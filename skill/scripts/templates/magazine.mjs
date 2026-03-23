/**
 * Magazine template — editorial, left-aligned, vertical accent bars.
 * Asymmetric layout, "Step 01" labels, italic subtitles.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

const swipeHintCssMagazine = `.swipe-hint{position:absolute;bottom:55px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:18px;font-weight:500;color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:22px;color:rgba(255,255,255,0.4)}
    @keyframes swipePulse{0%,100%{opacity:0.5;transform:translateX(0)}50%{opacity:1;transform:translateX(6px)}}`;

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const swipeCss = showSwipeHint ? swipeHintCssMagazine : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0d0d0d;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(6px) brightness(0.35) saturate(0.7);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.3) 50%,rgba(0,0,0,0.7) 100%);z-index:2}
.top-bar{position:absolute;top:50px;left:80px;right:80px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.6}.watermark img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))}
.brand-text{font-size:20px;font-weight:600;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase}
.counter{font-size:14px;font-weight:400;color:rgba(255,255,255,0.4);letter-spacing:3px;text-transform:uppercase}
.content{position:relative;z-index:3;padding:0 80px;text-align:left;width:100%}
.accent-bar{width:6px;height:80px;background:${brand.accent_color};border-radius:3px;margin-bottom:40px;box-shadow:0 0 20px ${brand.accent_color}40}
.hook-title{font-size:88px;font-weight:900;color:#fff;line-height:1.1;letter-spacing:-3px;text-shadow:0 2px 20px rgba(0,0,0,0.7)}
.divider{width:80px;height:2px;background:rgba(255,255,255,0.2);margin:36px 0}
.subtitle{font-size:28px;color:rgba(255,255,255,0.55);font-weight:300;font-style:italic;line-height:1.5}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="top-bar">${logoHtml}<div class="counter">1 of ${total}</div></div>
<div class="content"><div class="accent-bar"></div><div class="hook-title">${slide.title}</div><div class="divider"></div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0d0d0d;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(6px) brightness(0.35) saturate(0.7);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.25) 50%,rgba(0,0,0,0.65) 100%);z-index:2}
.top-bar{position:absolute;top:50px;left:80px;right:80px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.5}.watermark img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))}
.brand-text{font-size:20px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase}
.counter{font-size:14px;font-weight:400;color:rgba(255,255,255,0.4);letter-spacing:3px}
.content{position:relative;z-index:3;padding:0 80px;text-align:left;width:100%}
.content-row{display:flex;align-items:stretch;gap:40px}
.accent-rail{width:4px;background:linear-gradient(to bottom,${brand.accent_color},transparent);border-radius:2px;flex-shrink:0}
.text-col{flex:1}
.step-label{font-size:16px;font-weight:600;color:${brand.accent_color};letter-spacing:4px;text-transform:uppercase;margin-bottom:20px}
.title{font-size:62px;font-weight:800;color:#fff;line-height:1.15;letter-spacing:-2px;text-shadow:0 2px 16px rgba(0,0,0,0.6);margin-bottom:24px}
.body-text{font-size:30px;font-weight:300;color:rgba(255,255,255,0.8);line-height:1.65;text-shadow:0 1px 8px rgba(0,0,0,0.5)}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="top-bar">${logoHtml}<div class="counter">${slide.slide_number} of ${total}</div></div>
<div class="content"><div class="content-row"><div class="accent-rail"></div><div class="text-col">
<div class="step-label">Step ${String(slide.slide_number - 1).padStart(2, '0')}</div>
<div class="title">${slide.title}</div>
<p class="body-text">${slide.body}</p>${featuredImgHtml(featured)}</div></div></div></div>
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
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0d0d0d;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(10px) brightness(0.25) saturate(0.6);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2}
.content{position:relative;z-index:3;text-align:center;padding:0 90px}
.cta-logo{width:100px;height:100px;object-fit:contain;margin-bottom:48px;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.4))}
.cta-brand-name{font-size:52px;font-weight:800;color:#fff;margin-bottom:48px;letter-spacing:-1px}
.line-top{width:60px;height:2px;background:${brand.accent_color};margin:0 auto 40px;border-radius:1px}
.cta-title{font-size:68px;font-weight:800;color:#fff;line-height:1.15;letter-spacing:-2px;margin-bottom:16px;text-shadow:0 2px 16px rgba(0,0,0,0.5)}
.line-bottom{width:60px;height:2px;background:${brand.accent_color};margin:32px auto;border-radius:1px}
.cta-body{font-size:28px;color:rgba(255,255,255,0.7);font-weight:300;font-style:italic;margin-bottom:50px;line-height:1.5}
.website-pill{display:inline-block;border:1.5px solid rgba(255,255,255,0.25);border-radius:100px;padding:16px 48px;margin-bottom:28px}
.website-text{font-size:26px;font-weight:500;color:rgba(255,255,255,0.8);letter-spacing:1px}
.footer-brand{font-size:16px;font-weight:600;color:${brand.accent_color};letter-spacing:5px;text-transform:uppercase}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="content">${largeLogo}<div class="line-top"></div><div class="cta-title">${slide.title}</div><div class="line-bottom"></div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
${brand.website ? `<div class="website-pill"><span class="website-text">${brand.website}</span></div>` : ''}
<div class="footer-brand">${brand.name}</div></div></div>
</body></html>`;
}
