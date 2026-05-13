/**
 * Synthetic document identifier generator for detector QA.
 * These values are intentionally marked and shaped as non-official test fixtures.
 */

export type StateCode =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "FL" | "GA"
  | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME" | "MD"
  | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ"
  | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC"
  | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY";

export interface DLPackage {
  dlNumber: string;
  icn: string;
  dd: string;
}

export interface DLFormat {
  state: string;
  stateCode: StateCode;
  format: string;
  generate: () => string;
  generateICN: () => string;
  generateDD: () => string;
}

const stateNames: Record<StateCode, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const stateCodes = Object.keys(stateNames) as StateCode[];

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomChar = (chars: string): string =>
  chars[Math.floor(Math.random() * chars.length)];

const padZeros = (num: number, length: number): string =>
  String(num).padStart(length, "0");

const generateRandomString = (length: number, chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"): string =>
  Array.from({ length }, () => randomChar(chars)).join("");

const stateSeed = (stateCode: StateCode) =>
  stateCode.charCodeAt(0) * 31 + stateCode.charCodeAt(1);

const generateSyntheticDL = (stateCode: StateCode): string => {
  const seed = stateSeed(stateCode);
  const variants = [
    () => `TST-${stateCode}-${generateRandomString(1)}${padZeros(randomInt(100000, 999999), 6)}`,
    () => `TST-${stateCode}-${padZeros(seed % 100, 2)}-${padZeros(randomInt(1000000, 9999999), 7)}`,
    () => `TST-${stateCode}-${generateRandomString(2)}-${padZeros(randomInt(10000, 99999), 5)}`,
    () => `TST-${stateCode}-${padZeros(randomInt(100, 999), 3)}-${generateRandomString(2)}${padZeros(randomInt(1000, 9999), 4)}`,
  ];
  return variants[seed % variants.length]();
};

const generateSyntheticICN = (stateCode: StateCode): string =>
  `SYN-${stateCode}-ICN-${padZeros(randomInt(1000, 9999), 4)}-${generateRandomString(3)}-${padZeros(randomInt(100000, 999999), 6)}`;

const generateSyntheticDD = (stateCode: StateCode): string =>
  `SYN-${stateCode}-DD-${new Date().getFullYear()}-${padZeros(randomInt(10000000, 99999999), 8)}-TEST`;

const dlFormats = stateCodes.reduce((acc, stateCode) => {
  acc[stateCode] = {
    state: stateNames[stateCode],
    stateCode,
    format: "SYNTHETIC TEST ID",
    generate: () => generateSyntheticDL(stateCode),
    generateICN: () => generateSyntheticICN(stateCode),
    generateDD: () => generateSyntheticDD(stateCode),
  };
  return acc;
}, {} as Record<StateCode, DLFormat>);

export const generateDLNumber = (stateCode: StateCode): string => {
  const format = dlFormats[stateCode];
  if (!format) throw new Error(`State code ${stateCode} not supported`);
  return format.generate();
};

export const generateDLPackage = (stateCode: StateCode): DLPackage => {
  const format = dlFormats[stateCode];
  if (!format) throw new Error(`State code ${stateCode} not supported`);
  return {
    dlNumber: format.generate(),
    icn: format.generateICN(),
    dd: format.generateDD(),
  };
};

export const getStateName = (stateCode: StateCode): string =>
  dlFormats[stateCode]?.state || "Unknown";

export const getStateFormat = (stateCode: StateCode): string =>
  dlFormats[stateCode]?.format || "";

export const getAllStates = (): DLFormat[] =>
  Object.values(dlFormats).sort((a, b) => a.state.localeCompare(b.state));

export const generateMultipleDLNumbers = (stateCode: StateCode, count: number): string[] =>
  Array.from({ length: count }, () => generateDLNumber(stateCode));

export const generateMultipleDLPackages = (stateCode: StateCode, count: number): DLPackage[] =>
  Array.from({ length: count }, () => generateDLPackage(stateCode));
