// src/shared/utils.js
// Shared utility functions

import { TAG_CATEGORIES, TAG_TYPE_NAMES } from './constants';

/**
 * Determine tag category based on tag type
 * 
 * @param {string} tagTypeId - GTM tag type ID
 * @param {string} tagType - Display name of tag type
 * @returns {string} Category identifier
 */
export function determineTagCategory(tagTypeId, tagType) {
  let category = TAG_CATEGORIES.OTHER;
  
  if (tagTypeId === 'ua' || tagTypeId === 'ga4' || 
     (tagType && tagType.toLowerCase().includes('analytics'))) {
    category = TAG_CATEGORIES.ANALYTICS;
  } else if (tagTypeId === 'awct' || tagTypeId === 'flc' || tagTypeId === 'fls' || 
            (tagType && (tagType.toLowerCase().includes('ads') || 
             tagType.toLowerCase().includes('conversion')))) {
    category = TAG_CATEGORIES.ADVERTISING;
  } else if (tagTypeId === 'pcm' || 
            (tagType && tagType.toLowerCase().includes('personalization'))) {
    category = TAG_CATEGORIES.PERSONALIZATION;
  } else if (tagType && (tagType.toLowerCase().includes('functionality') || 
             tagType.toLowerCase().includes('utilities'))) {
    category = TAG_CATEGORIES.FUNCTIONALITY;
  }
  
  return category;
}

/**
 * Format date to readable time string
 * 
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Get readable name for tag type
 * 
 * @param {string} tagTypeId - GTM tag type ID
 * @returns {string} Human-readable tag type name
 */
export function getTagTypeName(tagTypeId) {
  return TAG_TYPE_NAMES[tagTypeId] || tagTypeId;
}

/**
 * Truncate string to specified length with ellipsis
 * 
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
export function truncateString(str, length = 100) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

/**
 * Convert object to JSON string with limited depth
 * 
 * @param {Object} obj - Object to stringify
 * @param {number} maxLength - Maximum string length
 * @returns {string} JSON string
 */
export function objectToString(obj, maxLength = 100) {
  try {
    const str = JSON.stringify(obj);
    return truncateString(str, maxLength);
  } catch (e) {
    return '[Object could not be stringified]';
  }
}