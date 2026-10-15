export const COMPATIBILITY_ERROR=Object.freeze({
  UNKNOWN_SOURCE_CONTRACT:'unknown-source-contract',
  UNSUPPORTED_CONTAINER_LAYOUT:'unsupported-container-layout',
  ADAPTER_AMBIGUOUS:'adapter-ambiguous',
  TARGET_PROFILE_MISSING:'target-profile-missing',
  TARGET_DISABLED:'target-disabled',
  SEMANTIC_MAPPING_INCOMPLETE:'semantic-mapping-incomplete',
  MUTATION_BUDGET_VIOLATION:'mutation-budget-violation',
  PAYLOAD_PRESERVATION_FAILED:'payload-preservation-failed',
  TARGET_CLASSIFICATION_FAILED:'target-classification-failed',
  AUXILIARY_CONVERSION_FAILED:'auxiliary-conversion-failed',
  PHYSICAL_VALIDATION_PENDING:'physical-validation-pending',
  PREFLIGHT_FAILED:'preflight-failed',
  RESOURCE_LIMIT_EXCEEDED:'resource-limit-exceeded',
  AMBIGUOUS_DEPENDENCY:'ambiguous-dependency',
});

export function compatibilityError(code,message,details=null){
  const error=Error(message);
  error.code=code;
  if(details!==null)error.details=details;
  return error;
}
