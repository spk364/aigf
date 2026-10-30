import { describe, it, expect } from 'vitest'
import {
  buildCharacterEditPrompt,
  buildCharacterScenePrompt,
  composeNegativePrompt,
} from './scene-prompt'
import { capPrompt, NOVITA_MAX_PROMPT } from '@/shared/ai/novita-prompt'

describe('buildCharacterEditPrompt', () => {
  it('instructs the model to keep identity and only restyle the scene', () => {
    const { prompt } = buildCharacterEditPrompt({
      scene: 'lying on the bed, in lingerie',
      artStyle: 'realistic',
    })
    expect(prompt).toMatch(/same person and identity/i)
    expect(prompt).toContain('lying on the bed, in lingerie')
    expect(prompt).toMatch(/photorealistic/i)
    // Must NOT re-describe a fresh subject (that re-rolls a new face).
    expect(prompt).not.toMatch(/RAW photo/i)
  })

  it('never mentions body markings (mentioning them — even to forbid — primes the model to add them)', () => {
    const { prompt } = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'realistic' })
    expect(prompt).not.toMatch(/tattoo/i)
    expect(prompt).not.toMatch(/piercing/i)
    expect(prompt).not.toMatch(/\bscars?\b/i)
    expect(prompt).not.toMatch(/marking/i)
    // Identity is still preserved via the generic "same … body" wording.
    expect(prompt).toMatch(/same skin and same body/i)
  })

  it('uses the anime style phrase for anime characters', () => {
    const { prompt } = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'anime' })
    expect(prompt).toMatch(/anime art style/i)
    expect(prompt).not.toMatch(/photorealistic/i)
  })

  it('directs explicit nudity depiction only when explicit', () => {
    const explicit = buildCharacterEditPrompt({ scene: 'topless', explicit: true }).prompt
    expect(explicit).toMatch(/undress the subject/i)
    expect(explicit).toMatch(/remove every piece of clothing/i)
    expect(explicit).toMatch(/do not censor, blur, pixelate/i)
    expect(explicit).toMatch(/re-clothe, or crop the body out of the frame/i)
    // Explicit must NOT use the "change the outfit" framing (implies clothing kept).
    expect(explicit).not.toMatch(/change only the outfit/i)
    const clothed = buildCharacterEditPrompt({ scene: 'in a dress' }).prompt
    expect(clothed).not.toMatch(/nudity/i)
    expect(clothed).toMatch(/change only the outfit/i)
  })

  it('falls back to a default scene when none is given', () => {
    const { prompt } = buildCharacterEditPrompt({ artStyle: 'realistic' })
    expect(prompt).toMatch(/selfie/i)
  })

  it('steers realistic edits to a natural iris (not anime)', () => {
    const realistic = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'realistic' }).prompt
    expect(realistic).toMatch(/true-to-reference eye color/i)
    expect(realistic).toMatch(/not glowing, neon, or oversaturated/i)
    const anime = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'anime' }).prompt
    expect(anime).not.toMatch(/eye color/i)
  })
})

describe('composeNegativePrompt', () => {
  it('keeps each concept once, in first-seen (priority) order', () => {
    expect(composeNegativePrompt(['bad anatomy, blurry', 'blurry, watermark'])).toBe(
      'bad anatomy, blurry, watermark',
    )
  })

  it('promotes a weighted variant over a bare duplicate, keeping the earlier slot', () => {
    expect(composeNegativePrompt(['low quality, blurry', '(low quality:1.2)'])).toBe(
      '(low quality:1.2), blurry',
    )
  })

  it('flattens unweighted groups so their members dedupe individually', () => {
    expect(composeNegativePrompt(['(cgi, 3d, blurry)', 'blurry, sketch'])).toBe(
      'cgi, 3d, blurry, sketch',
    )
  })

  it('never splits a weighted token', () => {
    expect(composeNegativePrompt(['(child:1.5), (flat chest:1.4)'])).toBe(
      '(child:1.5), (flat chest:1.4)',
    )
  })

  it('ignores empty and nullish groups', () => {
    expect(composeNegativePrompt([null, '', undefined, 'blurry, , blurry'])).toBe('blurry')
  })
})

describe('buildCharacterScenePrompt natural eyes', () => {
  const realisticAppearance = {
    subjectTokens: 'caucasian 25 year old woman, blonde hair, blue eyes',
    negativePrompt: 'ugly',
  }

  it('adds a natural-iris positive and negative for realistic scenes', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: realisticAppearance,
      artStyle: 'realistic',
      scene: 'lying on the bed',
    })
    expect(prompt).toMatch(/natural realistic eye color/i)
    expect(negativePrompt).toMatch(/glowing eyes/i)
    expect(negativePrompt).toMatch(/neon eyes/i)
  })

  it('leaves anime scenes vivid (no iris restraint)', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { appearancePrompt: 'anime girl, green eyes' },
      artStyle: 'anime',
      scene: 'at a cafe',
    })
    expect(prompt).not.toMatch(/natural realistic eye color/i)
    expect(negativePrompt).not.toMatch(/glowing eyes/i)
  })
})

describe('buildCharacterScenePrompt anime style hardening', () => {
  // Anime + explicit is served by the warm Atlas WAN t2i (photoreal prior), so
  // the prompt must hard-assert 2D anime and push photoreal into the negative —
  // otherwise an "anime" nude comes back semi-realistic.
  it('asserts 2D anime style and rejects photoreal for anime scenes', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { appearancePrompt: 'anime girl, twin tails' },
      artStyle: 'anime',
      scene: 'topless, bare breasts',
    })
    expect(prompt).toMatch(/2D anime illustration/i)
    expect(prompt).toMatch(/cel-shaded/i)
    expect(prompt).toMatch(/NOT photorealistic/i)
    expect(negativePrompt).toMatch(/\(photorealistic:1\.4\)/i)
    expect(negativePrompt).toMatch(/semi-realistic/i)
  })

  it('strips the baked-in "portrait" framing so a full-body request is not dragged to a headshot', () => {
    // Stored appearancePrompts start with "RAW photo, portrait of <subject>" —
    // that "portrait" overrode the requested full-body shot. It must be removed,
    // and the requested framing must lead the prompt.
    const { prompt } = buildCharacterScenePrompt({
      appearance: {
        appearancePrompt:
          'RAW photo, portrait of a beautiful woman, blonde hair, looking at camera, photorealistic',
      },
      artStyle: 'realistic',
      scene: 'lying on the bed, topless',
      shot: 'full_body_wide',
    })
    expect(prompt).not.toMatch(/portrait/i)
    expect(prompt).not.toMatch(/looking at camera/i)
    // The requested full-body framing leads, ahead of the subject description.
    expect(prompt.indexOf('full body')).toBeLessThan(prompt.indexOf('blonde hair'))
    // Subject identity tokens survive the strip.
    expect(prompt).toMatch(/blonde hair/)
  })

  it('does NOT add the anime style assertion to realistic scenes', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair' },
      artStyle: 'realistic',
      scene: 'topless',
    })
    expect(prompt).not.toMatch(/2D anime illustration/i)
  })

  it('prepends Pony score/rating tags for the anime Pony/Illustrious path', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { appearancePrompt: 'anime girl, twin tails' },
      artStyle: 'anime',
      scene: 'topless, bare breasts',
      isPony: true,
    })
    expect(prompt).toMatch(/score_9, score_8_up, score_7_up, score_6_up/)
    expect(prompt).toMatch(/rating_explicit/)
    expect(prompt).toMatch(/source_anime/)
    expect(negativePrompt).toMatch(/score_4/)
    // Pony V6 XL is 2.5D by default, so anime ALSO gets the flat-2D assertion
    // and the anti-3D negative + a solo guard.
    expect(prompt).toMatch(/2D anime illustration/i)
    expect(prompt).toMatch(/1girl, solo/)
    expect(negativePrompt).toMatch(/3D render/i)
  })

  // Regression: Novita truncates negative_prompt at 1024 chars from the tail.
  // The curated guards used to be appended LAST, so every explicit generation
  // lost the whole anti-deformity block — NSFW photos came back malformed while
  // SFW (short, reference-conditioned edit prompt) looked fine.
  it('keeps the anatomy/quality guards inside the provider cap on explicit scenes', () => {
    // A realistic stored character negative — verbose and largely redundant with
    // our curated blocks, which is what used to push the guards past the cap.
    const characterNegative =
      '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime), ' +
      'text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, ' +
      'mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, ' +
      'blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, ' +
      'gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, ' +
      'fused fingers, too many fingers, long neck, watermark, signature'

    for (const artStyle of ['realistic', 'anime'] as const) {
      const { negativePrompt } = buildCharacterScenePrompt({
        appearance: {
          subjectTokens: 'caucasian 25 year old woman, long wavy hair, green eyes, large breasts',
          appearancePrompt: 'RAW photo, portrait of a caucasian woman, long wavy hair, green eyes',
          negativePrompt: characterNegative,
        },
        artStyle,
        scene: 'lying on the bed, naked, legs spread',
        isPony: true,
        explicit: true,
      })

      // What actually reaches the model after the provider's cap.
      const sent = capPrompt(negativePrompt)
      expect(sent.length).toBeLessThanOrEqual(NOVITA_MAX_PROMPT)

      for (const guard of [
        /\(extra arms:1\.4\)/,
        /\(extra legs:1\.4\)/,
        /\(fused limbs:1\.3\)/,
        /\(malformed limbs:1\.3\)/,
        /\(mutated hands:1\.3\)/,
        /\(conjoined:1\.3\)/,
        /score_4/,
        /worst quality/i,
        /\(underage:1\.5\)/,
      ]) {
        expect(sent, `${artStyle}: ${guard} must survive the cap`).toMatch(guard)
      }
    }
  })

  it('does not repeat a concept it already emitted', () => {
    const { negativePrompt } = buildCharacterScenePrompt({
      appearance: {
        subjectTokens: 'woman, brown hair',
        negativePrompt: 'bad anatomy, extra limbs, low quality, deformed',
      },
      artStyle: 'realistic',
      scene: 'nude',
      isPony: true,
      explicit: true,
    })
    // Count whole tokens, not substrings — "deformed" and "(deformed iris:1.2)"
    // are distinct concepts and both legitimately belong.
    const tokens = negativePrompt
      .split(',')
      .map((t) => t.trim().replace(/^\(+|\)+$/g, '').replace(/:\s*[\d.]+$/, '').toLowerCase())
    const duplicated = tokens.filter((t, i) => t && tokens.indexOf(t) !== i)
    expect(duplicated, `duplicated tokens: ${duplicated.join(' | ')}`).toEqual([])
  })

  it('uses realistic Pony tags (no source_anime) for the realistic Pony path', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair, blue eyes' },
      artStyle: 'realistic',
      scene: 'topless, completely nude',
      isPony: true,
    })
    expect(prompt).toMatch(/score_9, score_8_up, score_7_up, score_6_up/)
    expect(prompt).toMatch(/rating_explicit/)
    // source_anime would push a realistic Pony toward 2D — must NOT be present.
    expect(prompt).not.toMatch(/source_anime/)
    // Realistic still gets the natural-iris guard.
    expect(prompt).toMatch(/natural realistic eye color/i)
    expect(negativePrompt).toMatch(/score_4/)
  })
})

describe('baked-in garments', () => {
  // Every seeded character carries the outfit their reference was generated in:
  // Marcus's own subject tokens end with "gym tank top", the girls carry
  // "designer outfit" / "professional attire". Beside "completely nude" the
  // model splits the difference and returns a half-dressed subject.
  const marcus = {
    subjectTokens:
      'african 30 year old man, muscular build, black buzz cut hair, defined abs, fight scars, gym tank top',
  }

  it('drops the baked outfit from the identity text on an explicit scene', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: marcus,
      artStyle: 'realistic',
      scene: 'completely nude, fully naked',
      explicit: true,
      gender: 'male',
    })
    expect(prompt).not.toMatch(/tank top/i)
    // …while the rest of the identity survives.
    expect(prompt).toMatch(/muscular build/)
    expect(prompt).toMatch(/fight scars/)
  })

  it('keeps the baked outfit when the scene is not explicit', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: marcus,
      artStyle: 'realistic',
      scene: 'at the gym',
    })
    expect(prompt).toMatch(/gym tank top/i)
  })

  it('does not add the explicit anatomy tokens the scene already carries', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: marcus,
      artStyle: 'realistic',
      scene: 'completely nude, nude male body, penis and testicles visible',
      explicit: true,
      gender: 'male',
    })
    expect(prompt.match(/nude male body/g)).toHaveLength(1)
    expect(prompt.match(/penis and testicles visible/g)).toHaveLength(1)
  })
})

describe('explicit negatives', () => {
  it('does not negate garments a partial-nudity scene deliberately keeps', () => {
    const { negativePrompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair' },
      artStyle: 'realistic',
      scene: 'in black stockings, topless, bare breasts, exposed nipples',
      explicit: true,
    })
    // Anti-censor always applies…
    expect(negativePrompt).toMatch(/\(censored:1\.4\)/)
    // …but negating clothing would undo the stockings that were asked for.
    expect(negativePrompt).not.toMatch(/\(clothed:1\.3\)/)
    expect(negativePrompt).not.toMatch(/\(panties:1\.4\)/)
  })

  it('negates garments on a strip-it-all request', () => {
    const { negativePrompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair' },
      artStyle: 'realistic',
      scene: 'completely nude, fully naked, no clothing, bare skin',
      explicit: true,
    })
    expect(negativePrompt).toMatch(/\(clothed:1\.3\)/)
    expect(negativePrompt).toMatch(/\(bra:1\.4\)/)
  })
})

describe('male characters', () => {
  const male = { subjectTokens: 'caucasian 30 year old man, athletic toned body, short messy hair' }

  it('never asks a realistic male scene for female anatomy or a female age guard', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: male,
      artStyle: 'realistic',
      scene: 'completely nude, fully naked',
      explicit: true,
      gender: 'male',
    })
    expect(prompt).toMatch(/penis and testicles visible/i)
    expect(prompt).not.toMatch(/bare breasts/i)
    // `flat chest` is an age cue for a female subject only — negating it fights
    // a man's own anatomy.
    expect(negativePrompt).not.toMatch(/flat chest/i)
    expect(negativePrompt).toMatch(/\(breasts:1\.4\)/)
    // …and the explicit guard against hedging with underwear is present.
    expect(negativePrompt).toMatch(/\(underwear:1\.4\)/)
  })

  it('tags an anime male scene 1boy, not 1girl', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: male,
      artStyle: 'anime',
      scene: 'completely nude',
      explicit: true,
      gender: 'male',
    })
    expect(prompt).toMatch(/^1boy, solo/)
    expect(prompt).not.toMatch(/1girl/)
    expect(prompt).toMatch(/detailed penis/i)
    expect(prompt).not.toMatch(/detailed pussy/i)
    expect(negativePrompt).toMatch(/2boys/)
    expect(negativePrompt).not.toMatch(/2girls/)
  })

  it('keeps the female defaults when no gender is passed', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair' },
      artStyle: 'anime',
      scene: 'completely nude',
      explicit: true,
    })
    expect(prompt).toMatch(/^1girl, solo/)
    expect(prompt).toMatch(/detailed pussy/i)
    expect(negativePrompt).toMatch(/flat chest/i)
  })

  it('rules out the ways the edit model hides the anatomy', () => {
    // Reported live: the photo came back with testicles and no shaft. The scene
    // ("undressing, taking clothes off") invites hands and clothing across the
    // groin, and nothing in the prompt forbade the occlusion.
    const { prompt } = buildCharacterEditPrompt({
      scene: 'undressing, fully naked',
      explicit: true,
      gender: 'male',
      shot: 'full_body',
    })
    expect(prompt).toMatch(/penis and testicles are fully visible/i)
    expect(prompt).toMatch(/nothing covers his groin — no hands, no clothing/i)
    // The edit path sent no framing at all, so WAN kept the reference's crop.
    expect(prompt).toMatch(/full-body shot showing the subject from head to toe/i)
  })

  it('names the male body in the explicit edit prompt', () => {
    const male = buildCharacterEditPrompt({ scene: 'fully naked', explicit: true, gender: 'male' })
      .prompt
    expect(male).toMatch(/penis and testicles are fully visible/i)
    expect(male).not.toMatch(/breasts/i)
    const female = buildCharacterEditPrompt({ scene: 'fully naked', explicit: true }).prompt
    expect(female).toMatch(/her breasts and her bare hips are fully visible/i)
    expect(female).not.toMatch(/penis/i)
    // Neither variant leaks anatomy into a clothed edit.
    const clothed = buildCharacterEditPrompt({ scene: 'in a leather jacket', gender: 'male' }).prompt
    expect(clothed).not.toMatch(/penis|breasts/i)
  })

  it('does not call a male subject a woman on the FLUX path', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: null,
      artStyle: 'realistic',
      scene: 'at home',
      isFlux: true,
      gender: 'male',
    })
    expect(prompt).toMatch(/The man is/)
    expect(prompt).toMatch(/21\+ adult man/)
    expect(prompt).not.toMatch(/woman/i)
  })
})
