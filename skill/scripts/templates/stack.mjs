/**
 * Stack template — full-bleed backgrounds with bottom-anchored content strips.
 * Minimal filtering, gradient fade at bottom, pill counter, tag labels.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintCssBold, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const ac = brand.accent_color;
  const swipeCss = showSwipeHint ? swipeHintCssBold : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:brightness(0.7) saturate(1.1);z-index:1}
.gradient-bottom{position:absolute;bottom:0;left:0;right:0;height:65%;background:linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.6) 50%,transparent 100%);z-index:2}
.header-top{position:absolute;top:45px;left:60px;right:60px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.7}.watermark img{width:50px;height:50px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6))}
.brand-text{font-size:22px;font-weight:700;color:rgba(255,255,255,0.7)}
.counter-pill{background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);border-radius:100px;padding:8px 20px}
.counter{font-size:16px;font-weight:600;color:rgba(255,255,255,0.8)}
.content{position:absolute;bottom:100px;left:60px;right:60px;z-index:3}
.tag{display:inline-block;background:${ac};color:#fff;font-size:16px;font-weight:700;padding:8px 20px;border-radius:6px;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px}
.hook-title{font-size:84px;font-weight:900;color:#fff;line-height:1.08;letter-spacing:-2px;text-shadow:0 4px 30px rgba(0,0,0,0.8)}
.subtitle{font-size:28px;color:rgba(255,255,255,0.65);font-weight:400;margin-top:24px;line-height:1.5}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div><div class="gradient-bottom"></div>
<div class="header-top">${logoHtml}<div class="counter-pill"><span class="counter">1 / ${total}</span></div></div>
<div class="content"><div class="tag">Featured</div><div class="hook-title">${slide.title}</div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  const ac = brand.accent_color;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:brightness(0.65) saturate(1.05);z-index:1}
.gradient-bottom{position:absolute;bottom:0;left:0;right:0;height:55%;background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 50%,transparent 100%);z-index:2}
.header-top{position:absolute;top:45px;left:60px;right:60px;z-index:4;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.5}.watermark img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6))}
.brand-text{font-size:20px;font-weight:600;color:rgba(255,255,255,0.5)}
.counter-pill{background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border-radius:100px;padding:8px 20px}
.counter{font-size:16px;font-weight:600;color:rgba(255,255,255,0.7)}
.content{position:absolute;bottom:80px;left:60px;right:60px;z-index:3}
.step-row{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.step-circle{width:44px;height:44px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0}
.step-text{font-size:15px;font-weight:500;color:${ac};letter-spacing:2px;text-transform:uppercase}
.title{font-size:54px;font-weight:800;color:#fff;line-height:1.18;letter-spacing:-1px;text-shadow:0 3px 20px rgba(0,0,0,0.7);margin-bottom:18px}
.divider{width:60px;height:3px;background:${ac};border-radius:2px;margin-bottom:18px;box-shadow:0 0 12px ${ac}40}
.body-text{font-size:28px;font-weight:300;color:rgba(255,255,255,0.8);line-height:1.6;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="gradient-bottom"></div>
<div class="header-top">${logoHtml}<div class="counter-pill"><span class="counter">${slide.slide_number} / ${total}</span></div></div>
<div class="content"><div class="step-row"><div class="step-circle">${slide.slide_number - 1}</div><div class="step-text">Step ${String(slide.slide_number - 1).padStart(2, '0')}</div></div>
<div class="title">${slide.title}</div><div class="divider"></div>
<p class="body-text">${slide.body}</p>${featuredImgHtml(featured)}</div></div>
</body></html>`;
}

export function cta(slide, brand, total, dim, bgCss, logoBase64, featured) {
  const ac = brand.accent_color;
  const largeLogo = logoBase64
    ? `<img src="${logoBase64}" alt="${brand.name}" class="cta-logo" />`
    : `<div class="cta-brand-name">${brand.name}</div>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(3px) brightness(0.5) saturate(1.05);z-index:1}
.gradient-bottom{position:absolute;bottom:0;left:0;right:0;height:75%;background:linear-gradient(to top,rgba(0,0,0,0.97) 0%,rgba(0,0,0,0.7) 50%,transparent 100%);z-index:2}
.content{position:relative;z-index:3;text-align:center;padding:0 70px 100px;width:100%}
.cta-logo{width:100px;height:100px;object-fit:contain;margin-bottom:36px;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.4))}
.cta-brand-name{font-size:56px;font-weight:900;color:#fff;margin-bottom:36px}
.cta-title{font-size:66px;font-weight:900;color:#fff;line-height:1.15;letter-spacing:-1px;text-shadow:0 4px 25px rgba(0,0,0,0.7);margin-bottom:20px}
.divider{width:60px;height:3px;background:${ac};margin:28px auto;border-radius:2px;box-shadow:0 0 12px ${ac}40}
.cta-body{font-size:28px;color:rgba(255,255,255,0.75);font-weight:300;margin-bottom:44px;line-height:1.5}
.action-btn{display:inline-block;background:${ac};color:#fff;font-size:24px;font-weight:700;padding:18px 56px;border-radius:12px;letter-spacing:1px;box-shadow:0 4px 20px ${ac}50;margin-bottom:24px}
.website{font-size:22px;color:rgba(255,255,255,0.5);font-weight:400}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="gradient-bottom"></div>
<div class="content">${largeLogo}<div class="cta-title">${slide.title}</div><div class="divider"></div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
<div class="action-btn">Learn More</div>
${brand.website ? `<p class="website">${brand.website}</p>` : ''}</div></div>
</body></html>`;
}
