/**
 * Clean template — duotone color overlay, ultra-minimal centered typography.
 * No step numbers, small colored dots, thin 1px lines, light font weights.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

const swipeHintCssClean = `.swipe-hint{position:absolute;bottom:55px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:18px;font-weight:400;color:rgba(255,255,255,0.4);letter-spacing:4px;text-transform:uppercase}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:22px;color:rgba(255,255,255,0.35)}
    @keyframes swipePulse{0%,100%{opacity:0.4;transform:translateX(0)}50%{opacity:0.8;transform:translateX(6px)}}`;

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const ac = brand.accent_color;
  const swipeCss = showSwipeHint ? swipeHintCssClean : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#111;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:brightness(0.45) saturate(0.5);z-index:1}
.color-wash{position:absolute;top:0;left:0;width:100%;height:100%;background:${ac}25;mix-blend-mode:multiply;z-index:2}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(0,0,0,0.3),rgba(0,0,0,0.5));z-index:3}
.top-bar{position:absolute;top:50px;left:80px;right:80px;z-index:5;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.5}.watermark img{width:44px;height:44px;object-fit:contain;filter:brightness(10) drop-shadow(0 0 4px rgba(0,0,0,0.3))}
.brand-text{font-size:18px;font-weight:500;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase}
.counter{font-size:14px;font-weight:400;color:rgba(255,255,255,0.35);letter-spacing:2px}
.content{position:relative;z-index:4;padding:0 100px;text-align:center}
.hook-title{font-size:82px;font-weight:300;color:#fff;line-height:1.2;letter-spacing:-1px}
.hook-title strong{font-weight:800}
.thin-line{width:40px;height:1px;background:rgba(255,255,255,0.3);margin:44px auto}
.subtitle{font-size:26px;color:rgba(255,255,255,0.5);font-weight:300;line-height:1.6;letter-spacing:0.5px}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div><div class="color-wash"></div><div class="overlay"></div>
<div class="top-bar">${logoHtml}<div class="counter">1 / ${total}</div></div>
<div class="content"><div class="hook-title">${slide.title}</div><div class="thin-line"></div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  const ac = brand.accent_color;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#111;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:brightness(0.4) saturate(0.5);z-index:1}
.color-wash{position:absolute;top:0;left:0;width:100%;height:100%;background:${ac}20;mix-blend-mode:multiply;z-index:2}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.55));z-index:3}
.top-bar{position:absolute;top:50px;left:80px;right:80px;z-index:5;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.4}.watermark img{width:44px;height:44px;object-fit:contain;filter:brightness(10) drop-shadow(0 0 4px rgba(0,0,0,0.3))}
.brand-text{font-size:18px;font-weight:500;color:rgba(255,255,255,0.35);letter-spacing:3px;text-transform:uppercase}
.counter{font-size:14px;font-weight:400;color:rgba(255,255,255,0.3);letter-spacing:2px}
.content{position:relative;z-index:4;padding:0 95px;text-align:center}
.dot{width:10px;height:10px;background:${ac};border-radius:50%;margin:0 auto 36px}
.title{font-size:58px;font-weight:700;color:#fff;line-height:1.22;letter-spacing:-1px;margin-bottom:20px}
.thin-line{width:40px;height:1px;background:rgba(255,255,255,0.25);margin:28px auto}
.body-text{font-size:28px;font-weight:300;color:rgba(255,255,255,0.7);line-height:1.7;letter-spacing:0.3px}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="color-wash"></div><div class="overlay"></div>
<div class="top-bar">${logoHtml}<div class="counter">${slide.slide_number} / ${total}</div></div>
<div class="content"><div class="dot"></div><div class="title">${slide.title}</div><div class="thin-line"></div>
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
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#111;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(8px) brightness(0.35) saturate(0.5);z-index:1}
.color-wash{position:absolute;top:0;left:0;width:100%;height:100%;background:${ac}20;mix-blend-mode:multiply;z-index:2}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:3}
.content{position:relative;z-index:4;text-align:center;padding:0 95px}
.cta-logo{width:90px;height:90px;object-fit:contain;margin-bottom:48px;filter:brightness(10) drop-shadow(0 0 4px rgba(0,0,0,0.3));opacity:0.8}
.cta-brand-name{font-size:48px;font-weight:300;color:#fff;margin-bottom:48px;letter-spacing:4px;text-transform:uppercase}
.cta-title{font-size:64px;font-weight:700;color:#fff;line-height:1.2;letter-spacing:-1px;margin-bottom:16px}
.thin-line{width:40px;height:1px;background:rgba(255,255,255,0.3);margin:32px auto}
.cta-body{font-size:26px;color:rgba(255,255,255,0.55);font-weight:300;margin-bottom:52px;line-height:1.6}
.action-link{display:inline-block;font-size:22px;font-weight:500;color:#fff;letter-spacing:3px;text-transform:uppercase;padding-bottom:4px;border-bottom:1px solid ${ac}}
.spacer{height:32px}
.website{font-size:20px;color:rgba(255,255,255,0.35);font-weight:300;letter-spacing:1px}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="color-wash"></div><div class="overlay"></div>
<div class="content">${largeLogo}<div class="cta-title">${slide.title}</div><div class="thin-line"></div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
<div class="action-link">Get Started</div><div class="spacer"></div>
${brand.website ? `<p class="website">${brand.website}</p>` : ''}</div></div>
</body></html>`;
}
