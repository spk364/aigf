// Serious safety events requiring (potential) human review. Lower-volume than
// content_flags — written for hard blocks, apparent-age classifier flags, and
// any image_filter rejection. CSAM-class incidents are retained 7 years and may
// trigger reporting obligations (handled operationally, not in code).
//
// Data-model §6. Admin-only in production once auth is tightened.
// TODO(phase-3-auth): restrict read/update to admin role.
import type { CollectionConfig } from 'payload'

export const SafetyIncidents: CollectionConfig = {
  slug: 'safety-incidents',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['status', 'severity'] },
    { fields: ['category', 'createdAt'] },
  ],
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'Critical', value: 'critical' },
      ],
      index: true,
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Underage Content', value: 'underage_content' },
        { label: 'Celebrity Impersonation', value: 'celebrity_impersonation' },
        { label: 'Violence', value: 'violence' },
        { label: 'Bestiality', value: 'bestiality' },
        { label: 'Non-Consent', value: 'non_consent' },
        { label: 'CSAM Attempt', value: 'csam_attempt' },
        { label: 'Apparent Age Classifier Flag', value: 'age_classifier_flag' },
        { label: 'Combinatorial Pattern', value: 'combinatorial_pattern' },
        { label: 'Jailbreak Attempt', value: 'jailbreak_attempt' },
        { label: 'Other', value: 'other' },
      ],
      index: true,
    },
    {
      name: 'triggeredAt',
      type: 'select',
      required: true,
      options: [
        { label: 'Input Filter', value: 'input_filter' },
        { label: 'Output Filter', value: 'output_filter' },
        { label: 'Image Filter', value: 'image_filter' },
        { label: 'Apparent Age Classifier', value: 'apparent_age_classifier' },
        { label: 'User Report', value: 'user_report' },
        { label: 'Admin', value: 'admin' },
      ],
    },
    {
      name: 'detectionMethod',
      type: 'select',
      required: true,
      options: [
        { label: 'Keyword', value: 'keyword' },
        { label: 'Classifier', value: 'classifier' },
        { label: 'Vision Model', value: 'vision_model' },
        { label: 'Scoring System', value: 'scoring_system' },
        { label: 'Manual', value: 'manual' },
      ],
    },
    { name: 'relatedMessageId', type: 'relationship', relationTo: 'messages' },
    { name: 'relatedImageId', type: 'relationship', relationTo: 'media-assets' },
    { name: 'relatedCharacterId', type: 'relationship', relationTo: 'characters' },
    {
      // { ageMarkers, youthAmplifiers, adultMarkers, sexualContext, triggeredRules[] }
      name: 'scoringDetails',
      type: 'json',
    },
    {
      // Short, PII-light forensic snapshot: matched terms, classifier verdict,
      // image url, model name. Encrypted at rest at the DB level.
      name: 'evidenceSnapshot',
      type: 'json',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Investigating', value: 'investigating' },
        { label: 'Resolved', value: 'resolved' },
        { label: 'False Positive', value: 'false_positive' },
      ],
      index: true,
    },
    {
      name: 'actionTaken',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Warning', value: 'warning' },
        { label: 'Suspension', value: 'suspension' },
        { label: 'Ban', value: 'ban' },
        { label: 'Content Deletion', value: 'content_deletion' },
        { label: 'Reported to Authorities', value: 'reported_to_authorities' },
      ],
    },
    { name: 'resolvedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'resolvedBy', type: 'relationship', relationTo: 'users' },
    { name: 'resolutionNotes', type: 'textarea' },
  ],
}
