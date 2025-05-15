// src/shared/constants.js
// Shared constants for the extension

/**
 * Tag category definitions
 */
export const TAG_CATEGORIES = {
  ANALYTICS: 'analytics',
  ADVERTISING: 'advertising',
  PERSONALIZATION: 'personalization',
  FUNCTIONALITY: 'functionality',
  OTHER: 'other'
};

/**
 * Event categories
 */
export const EVENT_CATEGORIES = {
  CONSENT: 'consent',
  GTM: 'gtm',
  TAG: 'tag'
};

/**
 * Consent types
 */
export const CONSENT_TYPES = {
  ANALYTICS: 'analytics_storage',
  ADS: 'ad_storage',
  FUNCTIONALITY: 'functionality_storage',
  PERSONALIZATION: 'personalization_storage',
  SECURITY: 'security_storage'
};

/**
 * Tag type to consent mapping
 */
export const TAG_TO_CONSENT_MAP = {
  'ua': CONSENT_TYPES.ANALYTICS,
  'ga4': CONSENT_TYPES.ANALYTICS,
  'awct': CONSENT_TYPES.ADS,
  'flc': CONSENT_TYPES.ADS,
  'fls': CONSENT_TYPES.ADS,
  'pcm': CONSENT_TYPES.PERSONALIZATION
};

/**
 * Tag type display names
 */
export const TAG_TYPE_NAMES = {
  'ua': 'Universal Analytics',
  'ga4': 'Google Analytics 4',
  'awct': 'Google Ads Conversion Tracking',
  'flc': 'Floodlight Counter',
  'fls': 'Floodlight Sales',
  'pcm': 'Personalization',
  'gclidw': 'GCLID Writes'
};

/**
 * Category colors for UI
 */
export const CATEGORY_COLORS = {
  [TAG_CATEGORIES.ANALYTICS]: '#4285f4',
  [TAG_CATEGORIES.ADVERTISING]: '#ea4335',
  [TAG_CATEGORIES.PERSONALIZATION]: '#fbbc05',
  [TAG_CATEGORIES.FUNCTIONALITY]: '#34a853',
  [TAG_CATEGORIES.OTHER]: '#9aa0a6'
};

/**
 * Consent presets
 */
export const CONSENT_PRESETS = {
  ALL_GRANTED: {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  },
  ALL_DENIED: {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'denied'
  },
  ANALYTICS_ONLY: {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  },
  ADS_ONLY: {
    analytics_storage: 'denied',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  },
  FUNCTIONAL_ONLY: {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  }
};