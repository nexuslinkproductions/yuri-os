/**
 * ESM re-export of recovery-grade DB family containment (runtime module).
 * correlationId=yuri-post-restoration-backend-readiness-v1
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const impl = require(path.join(path.dirname(fileURLToPath(import.meta.url)), 'backend-db-family-containment.cjs'));

export const FAMILY_SUFFIXES = impl.FAMILY_SUFFIXES;
export const ephRootReal = impl.ephRootReal;
export const pathPresentNoFollow = impl.pathPresentNoFollow;
export const legacyPathOnlyHardened = impl.legacyPathOnlyHardened;
export const legacyEnumerateDbFamilyOmitNonHardened = impl.legacyEnumerateDbFamilyOmitNonHardened;
export const assessDbFamilyMember = impl.assessDbFamilyMember;
export const isHardenedDbFamilyMember = impl.isHardenedDbFamilyMember;
export const enumerateDbFamily = impl.enumerateDbFamily;
export default impl;
