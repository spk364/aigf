import type { Payload } from 'payload'

type Localized = { en: string; ru: string; es: string }

type PackageSeed = {
  sku: string
  tokenAmount: number
  priceCents: number
  displayOrder: number
  displayName: Localized
  badgeText?: Localized
}

const PACKAGES: PackageSeed[] = [
  {
    sku: 'tokens_100',
    tokenAmount: 100,
    priceCents: 499,
    displayOrder: 10,
    displayName: {
      en: '100 tokens',
      ru: '100 токенов',
      es: '100 tokens',
    },
  },
  {
    sku: 'tokens_300',
    tokenAmount: 300,
    priceCents: 1299,
    displayOrder: 20,
    displayName: {
      en: '300 tokens',
      ru: '300 токенов',
      es: '300 tokens',
    },
    // Mid-tier "best value" badge — strongest converter on most pricing pages.
    badgeText: {
      en: 'Best value',
      ru: 'Выгодно',
      es: 'Mejor valor',
    },
  },
  {
    sku: 'tokens_1000',
    tokenAmount: 1000,
    priceCents: 3999,
    displayOrder: 30,
    displayName: {
      en: '1000 tokens',
      ru: '1000 токенов',
      es: '1000 tokens',
    },
    badgeText: {
      en: 'Save 20%',
      ru: 'Скидка 20%',
      es: 'Ahorra 20%',
    },
  },
  {
    sku: 'tokens_3000',
    tokenAmount: 3000,
    priceCents: 9999,
    displayOrder: 40,
    displayName: {
      en: '3000 tokens',
      ru: '3000 токенов',
      es: '3000 tokens',
    },
    badgeText: {
      en: 'Save 33%',
      ru: 'Скидка 33%',
      es: 'Ahorra 33%',
    },
  },
]

export async function seedTokenPackages(payload: Payload): Promise<void> {
  for (const pkg of PACKAGES) {
    const existing = await payload.find({
      collection: 'token-packages',
      where: { sku: { equals: pkg.sku } },
      limit: 1,
      overrideAccess: true,
    })

    const data = {
      sku: pkg.sku,
      displayName: pkg.displayName,
      tokenAmount: pkg.tokenAmount,
      priceCents: pkg.priceCents,
      currency: 'USD',
      isActive: true,
      displayOrder: pkg.displayOrder,
      badgeText: pkg.badgeText ?? null,
    }

    if (existing.docs.length === 0) {
      await payload.create({ collection: 'token-packages', data, overrideAccess: true })
      payload.logger.info({ msg: 'seeded token-package', sku: pkg.sku })
    } else {
      await payload.update({
        collection: 'token-packages',
        id: existing.docs[0]!.id as string,
        data,
        overrideAccess: true,
      })
      payload.logger.info({ msg: 'updated token-package', sku: pkg.sku })
    }
  }
}
