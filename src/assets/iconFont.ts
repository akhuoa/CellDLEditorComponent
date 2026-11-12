// The icon font (PrimeIcons) is defined in the document, since a `@font-face` rule
// doesn't work within a shadow root in all browsers (e.g. Chromium), whereas a font
// defined in the document can be used within a shadow root.
//
// A `@font-face` rule styles nothing by itself, so it doesn't affect a host (which
// would define the same font if it uses PrimeIcons). The rules that use the font
// (e.g. `.pi`) are in the editor's shadow root (see style.css).
//
// The attribute is the one OpenCOR uses, so that the font is only defined once.

import woff2 from 'primeicons/fonts/primeicons.woff2?inline'

if (!document.head.querySelector('style[primeicons-css="injected"]')) {
    const style = document.createElement('style')
    style.setAttribute('primeicons-css', 'injected')
    style.textContent = `@font-face {
  font-family: 'primeicons';
  font-display: block;
  src: url('${woff2}') format('woff2');
  font-weight: normal;
  font-style: normal;
}
`
    document.head.appendChild(style)
}
