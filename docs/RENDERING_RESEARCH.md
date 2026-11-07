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
| Sclera as white reference ([Choi et al. 2017](https://library.imaging.org/ei/articles/29/17/art00032))                                                                                                               | Measured sclera sRGB [0.70, 0.59, 0.54]; brightest-region selection; von Kries correction; as accurate as a colour checker. Used for scene light.                                                                                                                                                                                                                                                                      |
| Lip colour diversity ([Vergnaud et al. 2024](https://pubmed.ncbi.nlm.nih.gov/38924896/), [QIMA 2023](https://qima-lifesciences.com/cosmetic_publication/lip-color-measurement-a-new-hyperspectral-imaging-device/))  | Natural lip lightness and chroma vary a lot within and across ethnicities. **Don't infer room lighting from lip brightness.** So lip light adaptation stays weak and capped.                                                                                                                                                                                                                                           |

## Scene light: lighting the product like the face (implemented)

**Problem found in testing.** The Shiseido/LipAT method sets the lips' mean to the product
colour _as specified_. That works on well-lit, colour-balanced photos, but in a dim or warm
room the lipstick stays at daylight brightness and "glows" like a screen/overlay layer, while
a real lipstick would reflect the dim light like the skin around it.

**Fix: a physical light model.** The observed colour is reflectance × scene light, per channel
in linear RGB. So the product's daylight colour is multiplied by the scene light _before_ the
pigment transfer.

**Measuring the light without skin-tone bias.** Skin and lip lightness vary too much between
people to act as a light meter. The sclera (white of the eye) is melanin-free and nearly
constant. [Choi et al., "The human sclera and pupil as the calibration targets", Electronic
Imaging 2017](https://library.imaging.org/ei/articles/29/17/art00032):

- They calibrated photos with a colour checker and measured the sclera as **sRGB [0.70, 0.59,
  0.54]**. It is warm, not pure white. (Pupil [0.19, 0.15, 0.14].)
- Sclera pixels are segmented inside the eye shape, and the **brightest region** is used,
  which avoids vessels, dark spots and eyelid shadow.
- They apply a von Kries (per-channel) correction.
- The result was as accurate as a 24-patch colour checker: ΔE 9.13 vs 9.25.

Implementation (`tracking/light.ts`):

- Every 4 frames, sample both eyes inside the eye polygon, excluding the iris (and limbus) and clipped glare.
- Average the brightest 35% in linear light. The gain is that average divided by the reference sclera.
- Limit white balance to ±25% around the overall exposure, so a reddish sclera can't tint the light.
- Clamp the overall gain to 0.15–1.6, skip frames while blinking, and smooth over about 0.6 s.

**Measured (GPU, synthetic dim warm room at [0.42, 0.38, 0.30]):**

- The estimate was [0.419, 0.381, 0.307].
- Lip colour vs a physically lit real lipstick: **ΔE 21 before, ΔE 1.0 now.**

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

## Face + eyeshadow (implemented)

The research points to two physical behaviours, so there are two techniques. Every product
colour is first lit by the measured scene light.

**1. Coverage film (`pigment`): foundation, skin tint, concealer.**

- The region's mean CIELAB colour moves `shift` of the way to the shade.
- Colour blotchiness is reduced (kC < 1).
- The face's large-scale light and shadow stay (kL = 1), so it doesn't look flat or plastic.
- Fine lines and pores are softened by `smooth`. Measured foundation fills fine wrinkles and smooths highlights (NYCU).
- The finish reshapes shine with LipAT's roughness formula. Bare skin is ≈ 0.3; matte damps shine, dewy boosts it.

| Product    | Region                               | Shift (coverage) | kC  | Smooth | Edge                                                        | Finishes               |
| ---------- | ------------------------------------ | ---------------- | --- | ------ | ----------------------------------------------------------- | ---------------------- |
| Foundation | face skin (holes: eyes, brows, lips) | 0.60             | 0.5 | 0.18   | wide (0.07 × face width) so there's no line at hairline/jaw | matte / natural / dewy |
| Skin tint  | face skin                            | 0.30             | 0.8 | 0.15   | wide                                                        | dewy / matte / natural |
| Concealer  | under-eye crescents                  | 0.75             | 0.4 | 0.45   | 0.03                                                        | natural / matte / dewy |

**2. Thin translucent layer (`layer`): blush, bronzer, contour, eyeshadow, highlighter.**
In Kubelka-Munk terms, light passes through a thin pigment film. Each pixel is multiplied in
linear light by `(product ÷ own mean colour)^density`. At density 1 the region averages
exactly the product colour. Because it is a multiplication, texture, pores and shading
survive, and that is what makes blush look natural rather than painted on. The highlighter
uses density 0 plus a `glow` term: light-reflecting pigment adds light where light falls.

| Product     | Region                                                             | Density | Glow | Edge             | Finishes                           |
| ----------- | ------------------------------------------------------------------ | ------- | ---- | ---------------- | ---------------------------------- |
| Blush       | cheek apples (radial)                                              | 0.32    | –    | very soft (0.10) | satin / matte / shimmer            |
| Bronzer     | cheek hollows, jaw, cheeks                                         | 0.30    | –    | 0.09             | matte / satin / shimmer            |
| Contour     | cheek hollows, jaw, nose sides                                     | 0.38    | –    | 0.05             | matte                              |
| Highlighter | cheekbones, nose bridge, cupid's bow, brow bone                    | 0       | 0.20 | 0.055            | shimmer / satin / metallic         |
| Eyeshadow   | lid (0.62), crease (0.40, or 0.55× with one shade), outer V (0.50) | –       | –    | 0.018–0.03       | matte / satin / shimmer / metallic |

Eyeshadow zones are interpolated from the upper lash line (0) to the brow (1): lid 0–0.45,
crease 0.30–0.72, and the outer third up to 0.60 (`REGION_CONFIG.eyeshadow`). One shade
gives lid + a softer crease; `tones` gives lid / crease / outer like a palette (Perfect Corp
allows up to 5 eyeshadow colours).

**Realism fixes after phone testing (0.0.9):**

- **Region mean precision.** 8-bit mip sums corrupt the mean colour of small or split regions, which made concealer olive. Stats now use half-float and per-shape sampling.
- **Skin only.** Product fades out on pixels more than 16–32 L* darker than the region's skin mean (beard, stubble, nostrils). Ordinary facial shading stays within that margin.
- **Eye cut-out.** Eyeshadow and concealer are cut out of the eye opening after feathering, so the lash line is crisp and the eyes are untouched.
- **Blush placement styles.** Lifted (apple → temple), draped (cheekbone → temple → outer brow), sun-kissed (cheeks + nose bridge) and apples. These are the common ways blush is worn; a round dot alone looks fake.
- **Lower densities** for contour, bronzer, eyeshadow and highlighter. Shimmer only glints where light falls.

**Face shape → placement (0.0.10).** The product owner supplied face-shape and placement charts (6 ways to wear blush; contour & highlight for 16 face shapes; contour/highlight/blush for round, oval and square; a round-face guide). MediaPipe's mesh is regularised, so measured shape differences are small: length/width 1.10–1.21 and jaw/cheek 0.75–0.85 across the labelled faces. Nearest-prototype classification on [length, forehead, jaw, jaw angle], centred on the measured population, got 14/15 usable labelled samples right. Placement tables are in `render/placements.ts`.

| Shape    | Blush                   | Contour                         | Highlight                                   |
| -------- | ----------------------- | ------------------------------- | ------------------------------------------- |
| Oval     | lifted                  | cheek hollows, temples          | forehead, under-eye, nose, chin, cheekbones |
| Round    | vertical (outer cheek)  | temples, sides of face, hollows | forehead, nose, chin, under-eye (vertical)  |
| Square   | lifted                  | temples, hollows, jaw corners   | forehead, under-eye, nose, chin             |
| Oblong   | sun-kissed (horizontal) | hairline, under chin, hollows   | cheekbones, under-eye, cupid's bow          |
| Heart    | apples                  | temples, hollows                | chin, under-eye, nose, cheekbones           |
| Diamond  | apples                  | hollows, sides of face          | forehead, chin, under-eye, nose             |
| Triangle | draped                  | jaw, jaw corners, hollows       | forehead, cheekbones, under-eye, brow bone  |

**Concealer colour theory.** Peach/orange cancels blue-purple (dark circles, bruises). Green cancels redness. Same shade covers unevenness. One shade lighter brightens the high points. Peach and cover concealers weight toward pixels darker than the zone's mean; green applies only where a* is above the face mean, so plain skin is untouched (synthetic check: plain skin ΔE 0; red patch a* 27 → ~13).

**Application order** (build plan §5.4): foundation → skin tint → concealer → contour →
bronzer → blush → highlighter → eyeshadow → lip liner → lip colour → gloss.

**Measured on synthetic skin** (GPU; shading gradient, red blotches, pores, cheekbone highlight):

| Product            | Result                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation (Sand)  | ΔE to the shade 14.2 → 5.9 (60% coverage). Redness variation (a* SD) 2.41 → 1.26. Left/right shading difference kept (17.2 → 17.0 L*). Pore detail 7.4 → 5.0 (−32%, not plastic). |
| Skin tint          | 30% toward the shade; redness 2.41 → 1.99; most texture kept.                                                                                                                     |
| Blush (Soft Rose)  | Natural radial flush: Δa* +12.5 at the centre → +10.1 → +5.2 → +1.3 → 0. Pores kept.                                                                                              |
| Highlighter        | +8 L* on the cheekbone, 0 next to it.                                                                                                                                             |
| Eyeshadow (Bronze) | Lid moves toward the shade; crease softer.                                                                                                                                        |

First tuning attempts were too strong (foundation pores −53%, blush +17 a*, highlighter
+15 L*) and were toned down for a natural look. Validate on real faces next.

## Eyes and brows (Phase 5, planned recipes; eyeshadow done above)

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
