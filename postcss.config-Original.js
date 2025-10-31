const autoprefixer = require('autoprefixer');
const purgeCSSPlugin = require('@fullhuman/postcss-purgecss').default;

const purgecss = purgeCSSPlugin({
  mode: "all",
  content: ['./hugo_stats.json', './assets/js/**/*.js'],
  dynamicAttributes: ["aria-current", "aria-hidden", "role", "type"],
  defaultExtractor: content => {
    const els = JSON.parse(content).htmlElements;
    return [
      ...(els.tags || []),
      ...(els.classes || []),
      ...(els.ids || []),
    ];
  },
  // https://purgecss.com/safelisting.html
  safelist: {
    standard: [
      "show",
      "showing",
      "hide",
      "fade",
      /-backdrop$/,
      /^is-/,
      /^splide_/, // if your need carousel
    ],
  },
});

module.exports = {
  plugins: [
    process.env.HUGO_ENVIRONMENT !== 'development' ? purgecss : null,
    autoprefixer,
  ]
};
