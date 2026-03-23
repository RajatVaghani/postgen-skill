/**
 * Neon template — cyberpunk dark with glowing borders and text effects.
 * Corner accents, neon frame, glowing step numbers, dark cards.
 */
import { featuredImgHtml, featuredCss, fontImport, swipeHintHtml } from './shared.mjs';

export const bgStyle = 'dark';

function neonSwipeHintCss(accentColor) {
  return `.swipe-hint{position:absolute;bottom:55px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:20px;font-weight:700;color:${accentColor};letter-spacing:3px;text-transform:uppercase;text-shadow:0 0 10px ${accentColor}80}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:26px;color:${accentColor};text-shadow:0 0 10px ${accentColor}80}
    @keyframes swipePulse{0%,100%{opacity:0.5;transform:translateX(0)}50%{opacity:1;transform:translateX(6px)}}`;
}

export function hook(slide, brand, total, dim, bgCss, logoHtml, featured, { showSwipeHint }) {
  const ac = brand.accent_color;
  const swipeCss = showSwipeHint ? neonSwipeHintCss(ac) : '';
  const swipeEl = showSwipeHint ? swipeHintHtml : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#050510;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(4px) brightness(0.3) saturate(1.2);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,rgba(5,5,16,0.3) 0%,rgba(5,5,16,0.85) 100%);z-index:2}
.neon-frame{position:absolute;top:40px;left:40px;right:40px;bottom:40px;border:2px solid ${ac}30;border-radius:24px;z-index:3;box-shadow:inset 0 0 60px ${ac}10,0 0 30px ${ac}08}
.corner{position:absolute;width:40px;height:40px;z-index:4}
.corner-tl{top:36px;left:36px;border-top:3px solid ${ac};border-left:3px solid ${ac};border-radius:8px 0 0 0;box-shadow:-2px -2px 15px ${ac}50}
.corner-tr{top:36px;right:36px;border-top:3px solid ${ac};border-right:3px solid ${ac};border-radius:0 8px 0 0;box-shadow:2px -2px 15px ${ac}50}
.corner-bl{bottom:36px;left:36px;border-bottom:3px solid ${ac};border-left:3px solid ${ac};border-radius:0 0 0 8px;box-shadow:-2px 2px 15px ${ac}50}
.corner-br{bottom:36px;right:36px;border-bottom:3px solid ${ac};border-right:3px solid ${ac};border-radius:0 0 8px 0;box-shadow:2px 2px 15px ${ac}50}
.header-top{position:absolute;top:60px;left:80px;right:80px;z-index:5;display:flex;align-items:center;justify-content:space-between}
.watermark{opacity:0.6}.watermark img{width:50px;height:50px;object-fit:contain;filter:drop-shadow(0 0 8px ${ac}60)}
.brand-text{font-size:20px;font-weight:700;color:${ac};text-shadow:0 0 12px ${ac}60}
.counter{font-size:20px;font-weight:600;color:${ac};text-shadow:0 0 10px ${ac}60}
.content{position:relative;z-index:5;padding:0 100px;text-align:center}
.hook-title{font-size:90px;font-weight:900;color:#fff;line-height:1.12;text-transform:uppercase;letter-spacing:-2px;text-shadow:0 0 40px ${ac}40,0 0 80px ${ac}20,0 4px 20px rgba(0,0,0,0.8)}
.glow-line{width:180px;height:3px;background:${ac};margin:40px auto;border-radius:2px;box-shadow:0 0 20px ${ac},0 0 40px ${ac}60}
.subtitle{font-size:28px;color:rgba(255,255,255,0.6);font-weight:400;text-shadow:0 0 10px rgba(0,0,0,0.8)}
${featured ? featuredCss : ''}
${swipeCss}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="neon-frame"></div>
<div class="corner corner-tl"></div><div class="corner corner-tr"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div>
<div class="header-top">${logoHtml}<div class="counter">1/${total}</div></div>
<div class="content"><div class="hook-title">${slide.title}</div><div class="glow-line"></div>
${slide.body ? `<p class="subtitle">${slide.body}</p>` : ''}${featuredImgHtml(featured)}</div>${swipeEl}</div>
</body></html>`;
}

export function content(slide, brand, total, dim, bgCss, logoHtml, featured) {
  const ac = brand.accent_color;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
${fontImport(brand.font_family)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#050510;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(5px) brightness(0.25) saturate(1.1);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,rgba(5,5,16,0.3) 0%,rgba(5,5,16,0.9) 100%);z-index:2}
.header-top{position:absolute;top:50px;right:70px;z-index:5;display:flex;align-items:center;gap:20px}
.watermark{opacity:0.5}.watermark img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 0 8px ${ac}50)}
.brand-text{font-size:18px;font-weight:600;color:${ac};text-shadow:0 0 8px ${ac}50}
.counter{font-size:20px;font-weight:600;color:${ac};text-shadow:0 0 10px ${ac}50}
.content{position:relative;z-index:3;padding:0 80px;max-width:100%}
.card{background:rgba(10,10,30,0.7);border:1.5px solid ${ac}35;border-radius:20px;padding:65px 60px;backdrop-filter:blur(12px);box-shadow:0 0 40px ${ac}10,inset 0 0 30px ${ac}05}
.step-badge{display:inline-flex;align-items:center;gap:10px;margin-bottom:28px}
.step-num{font-size:40px;font-weight:900;color:${ac};text-shadow:0 0 20px ${ac}80}
.step-dot{width:8px;height:8px;background:${ac};border-radius:50%;box-shadow:0 0 10px ${ac}}
.title{font-size:56px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:20px;text-shadow:0 2px 16px rgba(0,0,0,0.7)}
.glow-line{width:80px;height:2px;background:${ac};margin-bottom:24px;border-radius:1px;box-shadow:0 0 15px ${ac}80}
.body-text{font-size:30px;font-weight:300;color:rgba(255,255,255,0.8);line-height:1.65}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="header-top">${logoHtml}<div class="counter">${slide.slide_number}/${total}</div></div>
<div class="content"><div class="card"><div class="step-badge"><span class="step-num">${String(slide.slide_number - 1).padStart(2, '0')}</span><span class="step-dot"></span></div>
<div class="title">${slide.title}</div><div class="glow-line"></div>
<p class="body-text">${slide.body}</p>${featuredImgHtml(featured)}</div></div></div>
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
body{font-family:'${brand.font_family}','Inter','Helvetica Neue','Arial',sans-serif;background:#050510;display:flex;justify-content:center;align-items:center;min-height:100vh}
.slide{position:relative;width:${dim.width}px;height:${dim.height}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.background{position:absolute;top:0;left:0;width:100%;height:100%;${bgCss}filter:blur(10px) brightness(0.2) saturate(1.1);z-index:1}
.overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,rgba(5,5,16,0.4) 0%,rgba(5,5,16,0.92) 100%);z-index:2}
.neon-frame{position:absolute;top:40px;left:40px;right:40px;bottom:40px;border:2px solid ${ac}25;border-radius:24px;z-index:3;box-shadow:inset 0 0 50px ${ac}08,0 0 25px ${ac}06}
.content{position:relative;z-index:5;text-align:center;padding:0 90px}
.cta-logo{width:110px;height:110px;object-fit:contain;margin-bottom:40px;filter:drop-shadow(0 0 20px ${ac}50)}
.cta-brand-name{font-size:56px;font-weight:900;color:${ac};margin-bottom:40px;text-shadow:0 0 30px ${ac}60}
.cta-title{font-size:72px;font-weight:900;color:#fff;line-height:1.15;text-transform:uppercase;margin-bottom:20px;text-shadow:0 0 30px ${ac}30,0 4px 20px rgba(0,0,0,0.8)}
.glow-line{width:120px;height:3px;background:${ac};margin:30px auto;border-radius:2px;box-shadow:0 0 20px ${ac},0 0 40px ${ac}50}
.cta-body{font-size:28px;color:rgba(255,255,255,0.7);font-weight:300;margin-bottom:50px;line-height:1.5}
.neon-button{display:inline-block;border:2px solid ${ac};border-radius:12px;padding:18px 52px;box-shadow:0 0 20px ${ac}40,inset 0 0 20px ${ac}10;margin-bottom:30px}
.neon-button span{font-size:28px;font-weight:700;color:#fff;letter-spacing:2px;text-shadow:0 0 10px ${ac}60}
.brand-footer{font-size:18px;font-weight:600;color:${ac};letter-spacing:4px;text-transform:uppercase;text-shadow:0 0 12px ${ac}40}
${featured ? featuredCss : ''}
</style></head><body>
<div class="slide"><div class="background"></div><div class="overlay"></div>
<div class="neon-frame"></div>
<div class="content">${largeLogo}<div class="cta-title">${slide.title}</div><div class="glow-line"></div>
<p class="cta-body">${slide.body}</p>${featuredImgHtml(featured)}
${brand.website ? `<div class="neon-button"><span>${brand.website}</span></div>` : ''}
<div class="brand-footer">${brand.name}</div></div></div>
</body></html>`;
}
