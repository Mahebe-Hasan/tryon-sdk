# Makeup Rendering Research

How commercial try-on and the research literature render makeup, and the recipes this SDK
uses as a result. Collected 2026-11-07. Values marked **(tuned)** are our own starting
points where no source gives a number — tune them with real devices and photos.

## Key finding

No serious try-on lets the shopper pick a blend mode. Each **product category** has a fixed
rendering method, and the product only supplies **shade + finish + intensity**.
Perfect Corp's public API is the clearest example. It exposes per-category texture enums
(lipstick: matte, satin, sheer, gloss, shimmer, metallic, holographic) and 0–100 intensities,
and nothing else.

The methods that work all share one idea. **Replace the colour, keep the person's own
light, shadow and texture, and re-shape the shine to match the finish.** Painting a colour
over the region is what made our first version look like a sticker.

## Sources

| Source                                                                                                                                                                                                               | What it gives us                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shiseido, US10939742B2](https://patents.google.com/patent/US10939742B2/en) (virtual makeup simulation)                                                                                                              | Lip colour in CIELAB: `L' = α(L_lip − μ_lip) + μ_product`, chroma taken from the product, α keeps texture (0 = full cover). Gloss is a histogram-based boost of the brightest lip pixels, plus "random reflectance" and transparency. Matte / moist / glossy textures.                                                                                                                                                 |
| [L'Oréal, US20250148723A1](https://patents.google.com/patent/US20250148723A1/en)                                                                                                                                     | Product colour defined in CIELAB, measured under D65 (colorimeter / spectrophotometer) or modelled with Kubelka-Munk. Colour corrected for the lips' luminosity. A single matte/shine parameter. ΔE for colour matching.                                                                                                                                                                                               |
| [Amazon, LipAT (WACV 2024)](https://www.amazon.science/publications/lipat-beyond-style-transfer-for-controllable-neural-simulation-of-lipstick-using-cosmetic-attributes)                                            | Lipstick = base colour + **roughness** + **opacity**. Image split I = D (diffuse) + S (specular). Diffuse: `D' = Lab(D) + Lab(product) − mean_mask(Lab(D))`. Specular: `S' = 1 − (1 − S)^γ`, `γ = 2.42·e^(−1.55·r)`. **Measured roughness: glossy 0.1, matte 0.7, skin 0.3.** Recombine with a screen blend, then opacity. Their failure analysis: imperfect lip-mask edges and highlights that don't match the image. |
| [Pret-A-Template, US11222446B2](https://patents.google.com/patent/US11222446B2/en) ("virtual face chart")                                                                                                            | Each product = diffuse colour layer + specular colour layer + normal map. Matte lipstick: dull, lighter specular. Cream: "much lighter" specular, wet glow. Frosty: complementary-tone specular + noisy normals. Glitter: white specular + random facets. Powder: _attenuates_ specular. Foundation: smoothed, dull specular.                                                                                          |
| [Huang et al., NYCU, "Physically-based Cosmetic Rendering"](https://people.cs.nycu.edu.tw/~wclin/cosmetics/Cosmetic_CASA_Final.pdf)                                                                                  | Kubelka-Munk layers for foundation, blush and lipstick, **measured with a spectroradiometer** (380–780 nm, D55). Layer stacking `R₁₂ = R₁ + T₁²R₂/(1 − R₁R₂)`. **Foundation fills fine wrinkles and smooths highlights.** Pearl/glitter can't be modelled by Kubelka-Munk alone (they're view-dependent).                                                                                                              |
| [Perfect Corp makeup API](https://docs.perfectcorp.com/reference/makeup_vto)                                                                                                                                         | Per-category controls (see the recipe tables below).                                                                                                                                                                                                                                                                                                                                                                   |
| [ModiFace](https://modiface.com/makeup-vto)                                                                                                                                                                          | Physics-based rendering, 11 finishes (glossy, matte, metallic, dewy, glitter, natural, satin, sparkle, shimmer, vinyl, twinkle).                                                                                                                                                                                                                                                                                       |
| [Banuba TINT](https://www.banuba.com/tint-makeup-virtual-try-on)                                                                                                                                                     | Finishes per category (lipstick: matte/glossy/satin, foundation: matte/natural, eyeliner and eyeshadow: matte/satin). Lighting adaptation for blush.                                                                                                                                                                                                                                                                   |
| [Li, Zhou, Lin, CVPR 2015](https://openaccess.thecvf.com/content_cvpr_2015/html/Li_Simulating_Makeup_Through_2015_CVPR_paper.html)                                                                                   | Makeup changes the albedo, diffuse shading and specular layers _differently_. Manipulate each layer with Kubelka-Munk (colour) and Torrance-Sparrow (shine). (Abstract only. The full text was blocked.)                                                                                                                                                                                                               |
| Coloured lenses: [Perfect Corp lens API](https://yce.perfectcorp.com/ai-api/products/ai-eye-color-lens-virtual-try-on-api), [Tencent Beauty AR](https://trtc.io/blog/details/try-on-contact-lens), US patent 6508553 | Lenses are **semi-transparent**: blend the pattern with the natural iris, keep catchlight reflections, add a limbal ring, use an elliptical boundary, and let the eyelids cover it.                                                                                                                                                                                                                                    |
| Lip colour diversity ([Vergnaud et al. 2024](https://pubmed.ncbi.nlm.nih.gov/38924896/), [QIMA 2023](https://qima-lifesciences.com/cosmetic_publication/lip-color-measurement-a-new-hyperspectral-imaging-device/))  | Natural lip lightness and chroma vary a lot within and across ethnicities. **Don't infer room lighting from lip brightness.** So lip light adaptation stays weak and capped.                                                                                                                                                                                                                                           |

## Lips (implemented, Phase 3)

The `pigment` technique in `composite.frag.glsl` follows the Shiseido/LipAT method:

1. **Shine estimate.** `S = clamp((L − L_local − 0.015) × 1.8) × smoothstep(0.3, 0.7, L)`. This is the brightness above the local average, on bright pixels only, and stands in for LipAT's shadow/highlight filter.
2. **Region mean.** The mask-weighted mean CIELAB of the diffuse colour `D = I − S`. It comes from a mipmapped stats pass, so an open mouth doesn't skew it.
3. **Colour.** `L' = L_p + kL(L − L̄)` and `ab' = ab_p + kC(ab − āb̄)`. The lips' average becomes exactly the product colour.
4. **Shine.** `S' = specScale · (1 − (1 − S)^γ)`, plus a synthetic wet highlight on the lower lip for glossy finishes. In flat light, real lips have no highlight to boost.
5. **Recombine** with a screen blend `1 − (1 − D')(1 − S'·specColour)`, add sparkle, then the product opacity × intensity.
6. **Edges.** The lip outline is a curve (centripetal Catmull-Rom spline), and the soft edge sits fully inside the lip line.

| Category         | Coverage | kL (texture) | kC (own colour) | Default finish | Reasoning                               |
| ---------------- | -------- | ------------ | --------------- | -------------- | --------------------------------------- |
| Lipstick         | 0.88     | 0.85         | 0.35            | satin          | High pigment; some lip texture visible  |
| Liquid lipstick  | 0.95     | 0.70         | 0.20            | matte          | Dries to a full-coverage film           |
| Lip gloss        | 0.42     | 1.00         | 0.75            | gloss          | Transparent tint; the lip shows through |
| Lip stain / tint | 0.60     | 1.00         | 0.60            | sheer          | Dyes the lip; texture and shine stay    |
| Lip liner        | 0.90     | 0.70         | 0.20            | matte          | Thin line on the outer lip edge         |

Coverage, kL and kC are our tuned values. They follow the coverage ordering the sources describe.

| Finish   | Roughness | Shine × | Shine colour | Wet highlight | Sparkle | Source                                           |
| -------- | --------- | ------- | ------------ | ------------- | ------- | ------------------------------------------------ |
| Matte    | 0.70      | 0.55    | white        | 0             | 0       | LipAT r; face chart "dull"; powder attenuates    |
| Satin    | 0.40      | 1.0     | white        | 0.08          | 0       | between LipAT matte and skin (tuned)             |
| Cream    | 0.30      | 1.0     | white        | 0.16          | 0       | face chart "wet glow" (tuned)                    |
| Sheer    | 0.20      | 1.05    | white        | 0.25          | 0       | low pigment, coverage × 0.55 (tuned)             |
| Gloss    | 0.10      | 1.15    | white        | 0.50          | 0       | LipAT r = 0.1; Shiseido highlight boost          |
| Shimmer  | 0.25      | 1.0     | slight tint  | 0.22          | 0.45    | Perfect Corp shimmer params (tuned)              |
| Metallic | 0.20      | 1.1     | tinted 0.7   | 0.30          | 0.18    | metals reflect tinted light; face chart "frosty" |

**Measured on synthetic lips (GPU):**

- Mean lip colour vs the product: matte lipstick ΔE 3.1, liquid matte ΔE 1.7. Glossier finishes read lighter because of the shine, as real glosses do.
- Highlight brightness rises in order: matte 136, satin 162, cream 170, gloss 205.
- Upper/lower lip shading and lip lines are kept. Skin and the inside of the mouth stay untouched.

## Face (Phase 4, planned recipes)

| Product           | Method                                                                                                                                                                                                    | Controls (from Perfect Corp's API)        | Notes from sources                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation        | `pigment` on the face skin region. Low kL (≈0.5) evens out tone. kC ≈ 0.3–0.5 by coverage. Mild local smoothing of the high-pass detail. Specular smoothed and damped for matte, raised slightly for dewy | colour, coverage, glow                    | Kubelka-Munk: foundation hides skin colour variation in proportion to coverage. NYCU: fills fine wrinkles and smooths highlights. Must stay subtle |
| Concealer         | Like foundation, on the under-eye. Lift L* toward the shade, reduce dark-circle chroma                                                                                                                    | colour, coverage, under-eye intensity     |                                                                                                                                                    |
| Blush             | Thin translucent pigment. Mostly a chroma (a*/b*) shift toward the shade with radial falloff; small L* change; texture fully kept (kL = 1)                                                                | matte / satin (glow) / shimmer, intensity | Kubelka-Munk thin layer; lighting adaptation (Banuba)                                                                                              |
| Bronzer / contour | Darken L* and warm b* in soft bands. Matte (shine damped)                                                                                                                                                 | intensity, pattern                        | Powder attenuates specular (face chart)                                                                                                            |
| Highlighter       | Add a light-coloured specular-like glow on the tops of features, plus shimmer particles                                                                                                                   | glow, shimmer intensity / density / size  | Face chart: white specular + noisy normals                                                                                                         |

## Eyes and brows (Phase 5, planned recipes)

| Product          | Method                                                                                                               | Controls                                           | Notes                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Eyeshadow        | `pigment` on the lid with a 1–3 tone gradient (lid → crease → outer). Moderate kL. Blink-faded                       | matte / shimmer / metallic, up to 5 colours        | Shiseido: templates warped to the eye landmarks |
| Eyeliner         | Near-opaque stroke with a crisp edge (small feather, centred). Satin shine                                           | matte / satin, thickness                           |                                                 |
| Kajal            | Thin, soft, slightly smudged dark line on the waterline                                                              | intensity                                          |                                                 |
| Mascara / lashes | Lash-strip texture warped along the upper lid, darkening plus a strand texture                                       | pattern, intensity                                 |                                                 |
| Brows            | Tint only the hair pixels (weight by darkness relative to skin) and fill gaps at low opacity                         | colour, shape (curvature / thickness / definition) | Perfect Corp brow params                        |
| Coloured lenses  | Semi-transparent pattern blended with the natural iris. Pupil and catchlights kept. Limbal ring. Clipped by the lids | colour, opacity, pattern                           | Perfect Corp, Tencent, US6508553                |

## Open questions / future data

- **Product colours.** Brands should supply shades measured under D65 (spectrophotometer → sRGB or Lab), as in the L'Oréal patent. Photos of the bullet give the wrong colour.
- **Validation.** Compare real worn-lipstick photos with renders under the same light, using ΔE on the lip mean and a side-by-side check. LipAT used Patch-FID and user studies.
- **Kubelka-Munk** for foundation and blush needs measured K/S per product. Without it we approximate with per-category coverage values.
