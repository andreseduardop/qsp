/**
 * @fileoverview PostCSS config with PurgeCSS using function extractors (JSON vs JS).
 * @version 1.2.0
 * @see https://google.github.io/styleguide/jsguide.html
 *
 * Carga: importa autoprefixer y el plugin de PurgeCSS.
 * Lee: usa un extractor función para hugo_stats.json y otro para archivos JS/TS/JSX/TSX.
 * Escribe: asegura que no intenta invocar una clase como función y purga correctamente.
 */
const autoprefixer = require('autoprefixer');
const purgeCSSPlugin = require('@fullhuman/postcss-purgecss').default;

// Lee: extractor para JSON de Hugo (devuelve tags, classes, ids)
const hugoJsonExtractor = (content) => {
  const parsed = JSON.parse(content);
  const els = (parsed && parsed.htmlElements) || {};
  return [
    ...(els.tags || []),
    ...(els.classes || []),
    ...(els.ids || []),
  ];
};

// Lee: extractor para JS/TS (ajustar regex si se usan caracteres especiales/bracket variants)
const jsLikeExtractor = (content) => {
  // Lee: captura tokens tipo clase; incluye '-', '_', ':', '.', '/', '@'
  const matches = content.match(/[\w-:./@]+/g);
  return matches || [];
};

const purgecss = purgeCSSPlugin({
  mode: 'all',
  content: ['./hugo_stats.json', './assets/js/**/*.js'],
  dynamicAttributes: ['aria-current', 'aria-hidden', 'role', 'type'],
  // Lee: asocia cada extractor con sus extensiones (funciones, no clases)
  extractors: [
    { extractor: hugoJsonExtractor, extensions: ['json'] },
    { extractor: jsLikeExtractor, extensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'] },
  ],
  safelist: {
    standard: [
      'show',
      'showing',
      'hide',
      'fade',
      /-backdrop$/,
      /^is-/,
      /^splide_/,
    ],
  },
});

module.exports = {
  plugins: [
    process.env.HUGO_ENVIRONMENT !== 'development' ? purgecss : null,
    autoprefixer,
  ],
};
