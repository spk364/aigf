// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const AgeVerifications: CollectionConfig = {
  slug: 'age-verifications',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'method',
      type: 'select',
      required: true,
      options: [
        { label: 'Self Declaration', value: 'self_declaration' },
        { label: 'DOB Confirmation', value: 'dob_confirmation' },
        { label: 'ID Upload', value: 'id_upload' },
      ],
    },
    {
      name: 'verifiedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'ipAddress',
      type: 'text',
    },
    {
      name: 'userAgent',
      type: 'text',
    },
    {
      name: 'dateOfBirthProvided',
      type: 'date',
    },
    {
      name: 'evidence',
      type: 'json',
    },
  ],
}
