/**
 * Bold template — dark, dramatic, cinematic.
 * Large step numbers, gradient accent lines, uppercase titles.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintCssBold, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const swipeCss = showSwipeHint ? swipeHintCssBold : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0514;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(3px) brightness(0.5) saturate(0.85);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(8,3,18,0.3) 0%,rgba(8,3,18,0.85) 100%);z-index:2}
.header-top{position:absolute;top:50px;right:60px;z-index:4;display:flex;align-items:center;gap:20px}
.watermark{opacity:0.7}.watermark img{width:55px;height:55px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))}
.brand-text{font-size:24px;font-weight:700;color:${brand.accent_color};opacity:0.7}
.counter{font-size:28px;font-weight:700;color:${brand.accent_color};text-shadow:0 2px 10px rgba(0,0,0,0.9)}
.content{position:relative;z-index:3;padding:0 85px;text-align:center}
.hook-title{font-size:96px;font-weight:900;color:#fff;line-height:1.15;text-shadow:0 4px 30px rgba(0,0,0,0.9);text-transform:uppercase;letter-spacing:-2px}
.gradient-line{width:150px;height:6px;background:linear-gradient(to right,${brand.accent_color},${brand.primary_color});margin:40px auto;border-radius:3px;box-shadow:0 0 30px ${brand.accent_color}40}
.subtitle{font-size:32px;color:rgba(255,255,255,0.7);font-weight:400}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="header-top">${logoHtml}<div class="counter">1/${total}</div></div>
<div class="content"><div class="hook-title">${slide.title}</div><div class="gradient-line"></div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0514;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(5px) brightness(0.6) saturate(0.85);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(8,3,18,0.25) 0%,rgba(8,3,18,0.94) 100%);z-index:2}
.header-top{position:absolute;top:50px;right:60px;z-index:4;display:flex;align-items:center;gap:20px}
.watermark{opacity:0.5}.watermark img{width:55px;height:55px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))}
.brand-text{font-size:24px;font-weight:700;color:${brand.accent_color};opacity:0.5}
.counter{font-size:28px;font-weight:700;color:${brand.accent_color};text-shadow:0 2px 10px rgba(0,0,0,0.9)}
.content{position:relative;z-index:3;padding:0 85px;max-width:100%}
.header{display:flex;align-items:flex-start;gap:35px;margin-bottom:30px}
.number{font-size:195px;font-weight:900;color:${brand.accent_color};line-height:0.9;text-shadow:0 0 50px ${brand.accent_color}99;filter:drop-shadow(0 0 35px ${brand.accent_color}80);flex-shrink:0;margin-top:-10px}
.title{font-size:72px;font-weight:900;color:#fff;line-height:1.25;text-shadow:0 4px 25px rgba(0,0,0,0.9);text-transform:uppercase;letter-spacing:-1px;padding-top:25px}
.gradient-line{width:120px;height:6px;background:linear-gradient(to right,${brand.accent_color},${brand.primary_color});margin:30px 0;border-radius:3px;box-shadow:0 0 25px ${brand.accent_color}80}
.body-text{font-size:34px;font-weight:400;color:rgba(255,255,255,0.88);line-height:1.6;text-shadow:0 2px 12px rgba(0,0,0,0.85)}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="header-top">${logoHtml}<div class="counter">${slide.slide_number}/${total}</div></div>
<div class="content"><div class="header"><div class="number">${String(slide.slide_number - 1).padStart(2, '0')}</div><div class="title">${slide.title}</div></div>
<div class="gradient-line"></div><p class="body-text">${slide.body}</p>${featuredImgHtml(featured)}</div></div>
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
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#0a0514;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(8px) brightness(0.4) saturate(0.85);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(8,3,18,0.4) 0%,rgba(8,3,18,0.95) 100%);z-index:2}
.content{position:relative;z-index:3;text-align:center;padding:0 80px}
.cta-logo{width:120px;height:120px;object-fit:contain;margin-bottom:40px;filter:drop-shadow(0 4px 20px rgba(0,0,0,0.5))}
.cta-brand-name{font-size:64px;font-weight:900;color:${brand.accent_color};margin-bottom:40px;text-shadow:0 0 40px ${brand.accent_color}60}
.cta-title{font-size:76px;font-weight:900;color:#fff;line-height:1.2;text-shadow:0 4px 25px rgba(0,0,0,0.9);text-transform:uppercase;margin-bottom:30px}
.gradient-line{width:150px;height:6px;background:linear-gradient(to right,${brand.accent_color},${brand.primary_color});margin:30px auto;border-radius:3px;box-shadow:0 0 30px ${brand.accent_color}60}
.cta-body{font-size:34px;color:rgba(255,255,255,0.85);margin-bottom:50px;line-height:1.5}
.save-text{font-size:30px;color:${brand.accent_color};font-weight:600;margin-bottom:30px}
.website-box{display:inline-block;border:2px solid ${brand.accent_color};border-radius:12px;padding:15px 40px;margin-bottom:30px}
.website-text{font-size:32px;font-weight:700;color:#fff}
.brand-footer{font-size:38px;font-weight:900;color:${brand.accent_color};text-transform:uppercase;letter-spacing:4px;text-shadow:0 0 30px ${brand.accent_color}50}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="content">${largeLogo}<div class="cta-title">${slide.title}</div><div class="gradient-line"></div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
<p class="save-text">Save this for later</p>
${brand.website ? `<div class="website-box"><span class="website-text">${brand.website}</span></div>` : ''}
<div class="brand-footer">${brand.name}</div></div></div>
</body></html>`;
}
