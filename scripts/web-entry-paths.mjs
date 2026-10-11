// GitHub Pages preview lives under /ustore/web/, while production serves
// dist/web as the host root. Nested production routes must resolve assets from /.
export function productionWebEntry(html) {
  return String(html)
    .replaceAll('href="./styles/', 'href="/styles/')
    .replaceAll('href="./shop-welcome.css', 'href="/shop-welcome.css')
    .replaceAll('src="./shop-welcome.js', 'src="/shop-welcome.js')
    .replaceAll('src="./config.public.js', 'src="/config.public.js')
    .replaceAll('src="./app.js', 'src="/app.js')
    .replaceAll('src="./launch-boot.js', 'src="/launch-boot.js');
}
