# Self-hosted UStorE wordmark fonts

Each of the 50 WOFF2 files has its own adjacent LICENSE.txt containing the original license and copyright notice. Licenses include SIL OFL, Ubuntu Font License and Apache 2.0; see each file rather than assuming one license applies to all fonts.

Source: the official [google/fonts repository](https://github.com/google/fonts), pinned commit `bd8f81ddb5c74d5c8897b36ad88b440266245103`. `catalog.json` records the exact original TTF URL, output SHA-256, selected static weight and cmap ranges for every file.

Variable originals were instantiated at the preset's existing weight and converted to WOFF2 with FontTools. Derived family names use the `UStore ` prefix so the bundled derivatives do not claim the upstream reserved family name. No original outline was redrawn. Where missing, U+02BB/U+02BC cmap entries reuse that font's existing typographic apostrophe glyph so Uzbek Latin Oʻ/Gʻ and Oʼ/Gʼ render using the selected family. License notices are preserved.

All families cover Uzbek Latin and Russian. Uzbek Cyrillic-specific letters are not available in every upstream family; the app reports unsupported text instead of silently using a fallback. Unicode ranges are checked before preview, save and PNG export.

The files are loaded on demand from the same origin with FontFace. `catalog.json` is loaded once; each family load is deduplicated. Failed loads have a finite timeout and can be retried. Export embeds the rendered appearance in PNG pixels, so the recipient need not install a font.

To reproduce conversion, use the original source URLs and static weights recorded in catalog.json, preserve the licenses, apply the family rename and quote mappings above, then regenerate SHA-256 and cmap ranges. Do not substitute a similarly named system font.
