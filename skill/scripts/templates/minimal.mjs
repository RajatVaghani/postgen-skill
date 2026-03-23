/**
 * Minimal template — clean, warm, light aesthetic.
 * Frosted glass cards, subtle accent lines, sentence case titles.
 */
import { featuredCss, fontImport, swipeHintCssMinimal, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'light';

export function hook(slide, brand, total, dim, bgCss, logoEl, featured, { showSwipeHint }) {
  const hc = '#1c1917', bc = '#44403c', mc = '#78716c';
  const swipeCss = showSwipeHint ? swipeHintCssMinimal : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#e8e4dd}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.bg{position:absolute;inset:0;${bgCss}filter:brightness(1.05) saturate(0.9);z-index:1}
.bg-overlay{position:absolute;inset:0;background:rgba(255,255,255,0.55);backdrop-filter:blur(2px);z-index:2}
.top-bar{position:absolute;top:50px;left:70px;right:70px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.logo{width:48px;height:48px;object-fit:contain}.logo-text{font-size:22px;font-weight:700;color:${hc}}
.counter{font-size:16px;font-weight:500;color:${mc};letter-spacing:2px}
.content{position:relative;z-index:3;padding:0 90px;text-align:center;max-width:100%}
.accent-line{width:60px;height:3px;background:${brand.accent_color};margin:0 auto 48px;border-radius:2px}
.hook-title{font-size:82px;font-weight:700;color:${hc};line-height:1.18;letter-spacing:-1.5px}
.subtitle{font-size:28px;color:${bc};font-weight:300;margin-top:32px;line-height:1.5}
.featured{margin:36px auto 0;text-align:center}.featured img{max-width:80%;max-height:350px;object-fit:contain;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,0.08)}
${swipeCss}
</style></head><body>
<div class="slide"><div class="bg"></div><div class="bg-overlay"></div>
<div class="top-bar">${logoEl}<div class="counter">1 / ${total}</div></div>
<div class="content"><div class="accent-line"></div><div class="hook-title">${slide.title}</div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featured ? `<div class="featured"><img src="${featured}" alt="Featured" /></div>` : ''}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoEl, featured) {
  const hc = '#1c1917', bc = '#44403c', mc = '#78716c';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#e8e4dd}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.bg{position:absolute;inset:0;${bgCss}filter:brightness(1.05) saturate(0.9);z-index:1}
.bg-overlay{position:absolute;inset:0;background:rgba(255,255,255,0.45);backdrop-filter:blur(2px);z-index:2}
.top-bar{position:absolute;top:50px;left:70px;right:70px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.logo{width:48px;height:48px;object-fit:contain}.logo-text{font-size:22px;font-weight:700;color:${hc}}
.counter{font-size:16px;font-weight:500;color:${mc};letter-spacing:2px}
.content{position:relative;z-index:3;padding:0 80px;max-width:100%}
.card{background:rgba(255,255,255,0.72);backdrop-filter:blur(16px);border-radius:32px;padding:70px 65px;box-shadow:0 4px 40px rgba(0,0,0,0.04)}
.step-num{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:${brand.accent_color}18;color:${brand.accent_color};font-size:24px;font-weight:700;margin-bottom:28px}
.title{font-size:56px;font-weight:700;color:${hc};line-height:1.22;margin-bottom:20px}
.accent-line{width:48px;height:3px;background:${brand.accent_color};border-radius:2px;margin-bottom:24px}
.body-text{font-size:32px;font-weight:300;color:${bc};line-height:1.6}
.featured{margin:36px auto 0;text-align:center}.featured img{max-width:85%;max-height:350px;object-fit:contain;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,0.08)}
</style></head><body>
<div class="slide"><div class="bg"></div><div class="bg-overlay"></div>
<div class="top-bar">${logoEl}<div class="counter">${slide.slide_number} / ${total}</div></div>
<div class="content"><div class="card"><div class="step-num">${slide.slide_number - 1}</div>
<div class="title">${slide.title}</div><div class="accent-line"></div>
<p class="body-text">${slide.body}</p>${featured ? `<div class="featured"><img src="${featured}" alt="Featured" /></div>` : ''}</div></div></div>
</body></html>`;
}

export function cta(slide, brand, total, dim, bgCss, ctaLogoB64, featured) {
  const hc = '#1c1917', bc = '#44403c', mc = '#78716c';
  const bigLogo = ctaLogoB64
    ? `<img src="${ctaLogoB64}" alt="${brand.name}" class="cta-logo" />`
    : `<div class="cta-brand">${brand.name}</div>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#e8e4dd}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.bg{position:absolute;inset:0;${bgCss}filter:brightness(1.05) saturate(0.9);z-index:1}
.bg-overlay{position:absolute;inset:0;background:rgba(255,255,255,0.6);backdrop-filter:blur(2px);z-index:2}
.content{position:relative;z-index:3;text-align:center;padding:0 80px}
.cta-logo{width:96px;height:96px;object-fit:contain;margin-bottom:40px}
.cta-brand{font-size:52px;font-weight:700;color:${hc};margin-bottom:40px}
.cta-title{font-size:62px;font-weight:700;color:${hc};line-height:1.2;margin-bottom:24px}
.accent-line{width:60px;height:3px;background:${brand.accent_color};margin:28px auto;border-radius:2px}
.cta-body{font-size:30px;color:${bc};font-weight:300;margin-bottom:48px;line-height:1.5}
.cta-button{display:inline-block;background:${brand.accent_color};color:#fff;font-size:26px;font-weight:600;padding:20px 56px;border-radius:60px;letter-spacing:1px}
.website{font-size:22px;color:${mc};font-weight:500;margin-top:32px}
.featured{margin:36px auto 0;text-align:center}.featured img{max-width:80%;max-height:350px;object-fit:contain;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,0.08)}
</style></head><body>
<div class="slide"><div class="bg"></div><div class="bg-overlay"></div>
<div class="content">${bigLogo}<div class="cta-title">${slide.title}</div><div class="accent-line"></div>
<p class="cta-body">${slide.body}</p>${featured ? `<div class="featured"><img src="${featured}" alt="Featured" /></div>` : ''}
<div class="cta-button">Get Started</div>
${brand.website ? `<p class="website">${brand.website}</p>` : ''}</div></div>
</body></html>`;
}
