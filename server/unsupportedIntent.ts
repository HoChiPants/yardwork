/** Compatibility entry point; browser/local and server planning share the same raw scope classifier. */
export {
  assessUnsupportedIntent,
  groundUnsupportedPlan,
} from "../src/unsupportedIntent";
export type {
  UnsupportedDomain,
  UnsupportedIntentAssessment,
} from "../src/unsupportedIntent";
