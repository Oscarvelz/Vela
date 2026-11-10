/* The app's version, from the one source of truth: package.json. Bump it on every release —
 * the Settings footer shows it, so a screenshot always says which build the phone is running. */
import { version } from "../../../package.json";

export const APP_VERSION = version;
