import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  DECISION_IDS,
  GWT_SPEC_FILES,
  MODULE_DOCS,
} from "../../spec/contract.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../..");