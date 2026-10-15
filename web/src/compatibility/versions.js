export const COMPATIBILITY_ENGINE_VERSION=2;
export const CONTRACT_FINGERPRINT_VERSION=2;
export const CONVERSION_PLAN_VERSION=3;
export const COMPATIBILITY_REPORT_VERSION=2;
export const TARGET_REGISTRY_VERSION=2;
export const RECOVERY_PREFLIGHT_VERSION=1;

export const COMPATIBILITY_LIMITS=Object.freeze({
  maxSourceBytes:512*1024*1024,
  maxItems:4096,
  maxReferences:32768,
  maxProperties:4096,
  maxPropertyAssociations:65536,
  maxExtentsPerItem:2048,
  maxTotalExtents:65536,
  maxEditingItems:2048,
  maxUnknownProperties:512,
  maxMetadataPayloadBytes:64*1024*1024,
  maxPlistKeys:4096,
  maxUriLength:4096,
  maxReferencesPerItem:4096,
  maxPropertyAssociationsPerItem:512,
});
