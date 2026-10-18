# PolarBash bear artwork

The approved full-body concept is preserved in `assets/polar/approved-concept.png`.
The implemented character is a set of illustrated sprites derived from that concept,
not a rigged 3D mesh or a pixel-identical extraction. It keeps the white fur, expressive
face, cyan scarf, navy quilted saddle and gold trim. Team identity remains visible
through the arena rings, name tags and HUD colors.

## Assets and reproduction

- `assets/polar/bear-source.png`: cleaned transparent source sheet, 6 columns × 5 rows.
- `public/games/polar/bear-atlas-v1.webp`: production atlas, 1536 × 1280, shared floor and centre.
- Run `node scripts/pack-polar-bear.mjs` to repack the source without changing its colors or alpha.
- Open `/bear-preview` for all six animation states and eight headings using the actual game renderer.
- Run `node --test tests/polar-bear.test.mjs` to check headings, state precedence, fallback and atlas bounds.

Rows: front, front/right, right, back/right, back. Left views are mirrored.
Columns: idle, first trot contact, opposite trot contact, charge, hit, victory.
Trot passes through neutral between opposite contact poses. Procedural breathing,
bounce, recoil, charge compression and victory hops complement the authored poses.
Falling uses the hit pose, wobble and waterline clipping. These are pose-based sprite
animations; continuous skeletal articulation is not provided by the concept art.
The previous procedural bear is retained as a loading/error fallback.

## Generation provenance

Generated using the built-in image generation tool, using the approved concept as
the visual reference. No API-key CLI or external character library was used.

Initial prompt specification: preserve the exact reference character's face, eyes,
black nose, fluffy warm white fur, chunky quadrupedal anatomy, cyan scarf, dark navy
quilted saddle and gold edging. Create a transparent 6-column by 5-row atlas with
one complete bear per cell, consistent scale, ground baseline and a slightly elevated
20-degree game camera. Rows face front, front/right, right, back/right and back.
Columns show calm idle, left-front/right-rear trot contact, opposite trot contact,
low determined charge, startled hit recoil, and upright happy victory. No text,
background, checkerboard, floor shadows, clipping, extra limbs or overlapping cells.

Cleanup prompt (applied to the first packed atlas):

> Use case: precise-object-edit. Clean up this 6 column by 5 row polar bear sprite atlas while keeping the same 30 bears, poses, facial features, blue scarf, navy quilted saddle and gold trim. IMPORTANT: remove ALL white rectangular patches, red/cyan edge contamination, stray floating pixels, detached slivers of neighboring bears, and duplicate noses at the cell edges. Outside each bear must be truly clear alpha. Each of the 30 character silhouettes must have a clean smooth anti-aliased edge, no white halo and no floor or shadow. Reconstruct any clipped noses or scarf edges within their own cell. Keep every bear fully inside its cell with generous clear padding, and preserve the exact 6x5 regular layout, shared ground baseline in each row, scale and pose. All side-view bears must have intact noses and paws. Keep beautiful original fur and materials, don't simplify or redesign. Output clean finished transparent game sprite atlas, no text, no checkerboard, no background.
