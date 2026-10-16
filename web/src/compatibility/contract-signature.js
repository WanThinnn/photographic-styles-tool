import {sanitizeContractFingerprint} from './contract-fingerprint.js';
import {COMPATIBILITY_ENGINE_VERSION,CONTRACT_FINGERPRINT_VERSION} from './versions.js';

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);
    return out;
  }
  if(typeof value==='number'&&!Number.isFinite(value))return String(value);
  return value;
}

export function stableSanitizedContractJson(sanitizedFingerprint){
  return JSON.stringify(canonical(sanitizedFingerprint));
}

export function stableContractJson(fingerprint){
  return stableSanitizedContractJson(sanitizeContractFingerprint(fingerprint));
}

function fnv1a32(text,seed=0x811c9dc5){
  let hash=seed>>>0;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return hash>>>0;
}
function signatureFromJson(json){
  // Four independent 32-bit lanes give a compact 128-bit structural ID.
  // This is a deterministic contract identifier, not a cryptographic trust
  // primitive; adapters still require fixture evidence and qualification.
  const seeds=[0x811c9dc5,0x9e3779b1,0x85ebca6b,0xc2b2ae35];
  const digest=seeds.map(seed=>fnv1a32(json,seed).toString(16).padStart(8,'0')).join('');
  return `c${CONTRACT_FINGERPRINT_VERSION}-${digest}`;
}

export function contractSignatureFromSanitized(sanitizedFingerprint){
  if(sanitizedFingerprint?.version!==CONTRACT_FINGERPRINT_VERSION)
    throw Error('Sanitized contract fingerprint version mismatch');
  return signatureFromJson(stableSanitizedContractJson(sanitizedFingerprint));
}

export function contractSignature(fingerprint){
  return signatureFromJson(stableContractJson(fingerprint));
}

export function contractIdentity(fingerprint){
  return {
    engineVersion:COMPATIBILITY_ENGINE_VERSION,
    fingerprintVersion:CONTRACT_FINGERPRINT_VERSION,
    signature:contractSignature(fingerprint),
  };
}
