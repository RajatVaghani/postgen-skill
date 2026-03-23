/**
 * Shared HTML/CSS helpers used by all PostGen slide templates.
 */

export function featuredImgHtml(b64) {
  if (!b64) return '';
  return `<div class="featured-image"><img src="${b64}" alt="Featured" /></div>`;
}

export const featuredCss = `.featured-image { margin: 30px auto; text-align: center; }
    .featured-image img { max-width: 85%; max-height: 400px; object-fit: contain; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }`;

export function fontImport(family) {
  return `@import url('https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@300;400;500;700;900&display=swap');`;
}

export const swipeHintHtml = '<div class="swipe-hint"><span>SWIPE</span><span class="arrow">\u203A</span></div>';

export const swipeHintCssBold = `.swipe-hint{position:absolute;bottom:60px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:22px;font-weight:600;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:28px;color:rgba(255,255,255,0.5)}
    @keyframes swipePulse{0%,100%{opacity:0.6;transform:translateX(0)}50%{opacity:1;transform:translateX(6px)}}`;

export const swipeHintCssMinimal = `.swipe-hint{position:absolute;bottom:60px;left:0;right:0;z-index:4;text-align:center;animation:swipePulse 2s ease-in-out infinite}
    .swipe-hint span{font-size:20px;font-weight:500;color:#78716c;letter-spacing:2px}
    .swipe-hint .arrow{display:inline-block;margin-left:8px;font-size:24px;color:#78716c}
    @keyframes swipePulse{0%,100%{opacity:0.5;transform:translateX(0)}50%{opacity:1;transform:translateX(6px)}}`;
