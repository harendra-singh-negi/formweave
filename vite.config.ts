import { defineConfig, loadEnv } from 'vite'

// npm run demo: the demo app, served straight from src/ with live reload, on this computer only.
// npm run demo:build: the same app as static files in demo/dist, for GitHub Pages.
// Google Analytics and Search Console go in only when their IDs are set (GitHub repository variables in CI).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ga = env.GA_MEASUREMENT_ID
  const gtm = env.GTM_ID
  const verify = env.GOOGLE_SITE_VERIFICATION
  return {
    root: 'demo',
    base: './',
    server: { host: '127.0.0.1', port: 5180 },
    plugins: [
      {
        name: 'demo-head',
        transformIndexHtml: () => [
          ...(verify ? [{ tag: 'meta', attrs: { name: 'google-site-verification', content: verify } }] : []),
          // Google Tag Manager: Google's own snippet, in the head and right after <body>.
          ...(gtm
            ? [
                {
                  tag: 'script',
                  injectTo: 'head-prepend' as const,
                  children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtm)});`,
                },
                {
                  tag: 'noscript',
                  injectTo: 'body-prepend' as const,
                  children: `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtm)}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
                },
              ]
            : []),
          ...(ga
            ? [
                { tag: 'script', attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ga}` } },
                {
                  tag: 'script',
                  children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga)});`,
                },
              ]
            : []),
        ],
      },
    ],
  }
})
