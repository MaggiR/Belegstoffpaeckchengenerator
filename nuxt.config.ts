export default defineNuxtConfig({
  compatibilityDate: '2025-05-01',
  future: { compatibilityVersion: 4 },
  modules: ['@nuxtjs/tailwindcss'],
  ssr: false,
  app: {
    head: {
      title: 'BSP-Generator',
      meta: [
        { name: 'description', content: 'Belegstoffpäckchengenerator – Einfache Web-App für FDP-Schatzmeister' },
      ],
      htmlAttrs: { lang: 'de' },
    },
  },
  tailwindcss: {
    config: {
      darkMode: 'class',
    },
  },
  vite: {
    optimizeDeps: {
      include: ['pdfjs-dist', 'papaparse', 'xlsx'],
    },
  },
})
