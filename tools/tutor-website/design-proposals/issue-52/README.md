# Lesson favicon proposals

Three asset-only proposals for [issue #52](https://github.com/iricigor/dusan.iric.online/issues/52).
These are review assets, not a selected replacement. The live `favicon.svg`,
generator, tutor agents, published lessons and independent Gems workflow are
unchanged. Fancy versions are proposals for possible later webpage use, not
integrated logos.

| Preview | 01 / Reference enamel | 02 / Upright letterpress | 03 / Rounded satin |
| --- | --- | --- | --- |
| Simple, 128 x 128 | ![Reference simple](reference-simple-128.png) | ![Upright simple](upright-simple-128.png) | ![Rounded simple](rounded-simple-128.png) |
| Fancy, 128 x 128 | ![Reference fancy](reference-fancy-128.png) | ![Upright fancy](upright-fancy-128.png) | ![Rounded fancy](rounded-fancy-128.png) |
| Actual 16 x 16 | ![Reference 16px](reference-simple-16.png) | ![Upright 16px](upright-simple-16.png) | ![Rounded 16px](rounded-simple-16.png) |
| Actual 32 x 32 | ![Reference 32px](reference-simple-32.png) | ![Upright 32px](upright-simple-32.png) | ![Rounded 32px](rounded-simple-32.png) |
| Native-size light/dark tab samples | ![Reference tab evidence](reference-tab-evidence.png) | ![Upright tab evidence](upright-tab-evidence.png) | ![Rounded tab evidence](rounded-tab-evidence.png) |

The tab evidence images contain unscaled 16px and 32px favicons against light
(`#f1f3f5`) and dark (`#20242b`) backgrounds. View at 100% browser zoom.
Display device-pixel ratio may still affect physical pixels.

## Full-height framing

Each D-and-cap mark spans 31 of the 32 SVG units vertically (96.9% of the
icon height), leaving only 0.5 units above and below to prevent clipping.
At 16px, this is a quarter-pixel geometric clearance: the visible mark
reaches both the first and last pixel rows. A uniform scale and translation
preserve the D proportions, cap angle, tassel and slight overlap, rather
than stretching the letter vertically. The pale tile remains full-size.
Each simple/fancy pair uses the same framing transform.

## Differences and tradeoffs

**Reference enamel** retains the approved reference's letter/cap proportions,
enlarged together to fill the height. Its generous bowl has a counter about
11.2 framed SVG units high. The fancy version adds a
porcelain tile, a navy enamel gradient and a clipped fine highlight.

**Upright letterpress** has a taller, narrower D, a straighter shoulder and a
shorter, higher cap that slightly overlaps the upper-left shoulder. Its
13.2-unit-high framed counter provides more vertical breathing room, but its
6.6-unit-wide opening is narrower than the reference. The fancy version uses a
restrained inset tile border and directional blue ink gradient.

**Rounded satin** has softened left corners and a compact, rounder bowl,
now enlarged to the same full-height framing. The corner rounding is subtle
at 16px; the bold stem and 11.8-unit-high framed counter carry recognition. The fancy version
adds a softly lit tile and blue-to-teal satin shading.

All simple assets use the reference palette: blue `#1e3c72`, black `#000000`
and pale `#f1f5f9`. Every cap consists of a short diagonal stroke and a
downward-hanging left tassel. Each simple/fancy pair shares identical D and
cap/tassel paths; fancy highlights are clipped to the letter. Gradients,
highlights and inset tile borders are absent from the small favicon sources.

## Editable sources

| Concept | Simple SVG | Fancy SVG |
| --- | --- | --- |
| Reference enamel | [Source](reference-simple.svg) | [Source](reference-fancy.svg) |
| Upright letterpress | [Source](upright-simple.svg) | [Source](upright-fancy.svg) |
| Rounded satin | [Source](rounded-simple.svg) | [Source](rounded-fancy.svg) |

All sources use a `0 0 32 32` view box. Simple SVGs have intrinsic 32px
dimensions; fancy SVGs have intrinsic 128px dimensions. PNG previews were
rasterized directly from the corresponding SVG at their named dimensions,
not downscaled from fancy logos.

The local comparison HTML and preview server remain session artifacts,
outside the repository; this directory introduces no runtime dependency.
