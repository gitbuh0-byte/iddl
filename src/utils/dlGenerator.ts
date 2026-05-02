/**
 * Driver's License Number Generator
 * Generates realistic DL numbers, ICN, and DD for various US states
 */

export type StateCode = "IA" | "NH" | "AZ" | "FL" | "IL" | "WV" | "CA";

export interface DLPackage {
  dlNumber: string;
  icn: string;
  dd: string;
}

interface DLFormat {
  state: string;
  stateCode: StateCode;
  format: string;
  generate: () => string;
  generateICN: () => string;
  generateDD: () => string;
}

// Random number generator helper
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomChar = (chars: string): string =>
  chars[Math.floor(Math.random() * chars.length)];

const padZeros = (num: number, length: number): string =>
  String(num).padStart(length, "0");

const generateRandomString = (length: number, chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"): string =>
  Array.from({ length }, () => randomChar(chars)).join("");

// State-specific generators
const dlFormats: Record<StateCode, DLFormat> = {
  IA: {
    state: "Iowa",
    stateCode: "IA",
    format: "XXX-XX-XXXX",
    generate: () => {
      // Iowa: 3 digits - 2 digits - 4 digits
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = padZeros(randomInt(10, 99), 2);
      const part3 = padZeros(randomInt(1000, 9999), 4);
      return `${part1}-${part2}-${part3}`;
    },
    generateICN: () => {
      // Iowa ICN format (alphanumeric identifier)
      const chars1 = padZeros(randomInt(100, 999), 3);
      const chars2 = generateRandomString(2);
      const chars3 = padZeros(randomInt(1000000, 9999999), 7);
      const chars4 = padZeros(randomInt(10, 99), 2);
      return `${chars1}${chars2}${chars3}${chars4}`;
    },
    generateDD: () => {
      // Iowa DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      const part4 = generateRandomString(1);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  NH: {
    state: "New Hampshire",
    stateCode: "NH",
    format: "XX#####",
    generate: () => {
      // New Hampshire: 2 letters + 5 digits
      const letters = generateRandomString(2);
      const numbers = padZeros(randomInt(10000, 99999), 5);
      return `${letters}${numbers}`;
    },
    generateICN: () => {
      // NH ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(1000, 9999), 4);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // NH DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  AZ: {
    state: "Arizona",
    stateCode: "AZ",
    format: "#X#####",
    generate: () => {
      // Arizona: 1 digit + 1 letter + 5 digits + 1 digit (simplified)
      const digit1 = randomInt(1, 9);
      const letter = randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const numbers = padZeros(randomInt(10000, 99999), 5);
      const digit2 = randomInt(0, 9);
      return `${digit1}${letter}${numbers}${digit2}`;
    },
    generateICN: () => {
      // AZ ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(10000, 99999), 5);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // AZ DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  FL: {
    state: "Florida",
    stateCode: "FL",
    format: "X########",
    generate: () => {
      // Florida: 1 letter + 8 digits
      const letter = randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const numbers = padZeros(randomInt(10000000, 99999999), 8);
      return `${letter}${numbers}`;
    },
    generateICN: () => {
      // FL ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(100000, 999999), 6);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // FL DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  IL: {
    state: "Illinois",
    stateCode: "IL",
    format: "X#####X#",
    generate: () => {
      // Illinois: 1 letter + 5 digits + 1 letter + 1 digit
      const letter1 = randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const numbers1 = padZeros(randomInt(10000, 99999), 5);
      const letter2 = randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const number = randomInt(0, 9);
      return `${letter1}${numbers1}${letter2}${number}`;
    },
    generateICN: () => {
      // IL ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(100000, 999999), 6);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // IL DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  WV: {
    state: "West Virginia",
    stateCode: "WV",
    format: "######",
    generate: () => {
      // West Virginia: 6-7 digits
      const numbers = padZeros(randomInt(100000, 999999), 6);
      return numbers;
    },
    generateICN: () => {
      // WV ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(100000, 999999), 6);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // WV DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
  CA: {
    state: "California",
    stateCode: "CA",
    format: "X########",
    generate: () => {
      // California: 1 letter + 5-8 digits (using 8 for consistency)
      const letter = randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const numbers = padZeros(randomInt(10000000, 99999999), 8);
      return `${letter}${numbers}`;
    },
    generateICN: () => {
      // CA ICN format
      const part1 = padZeros(randomInt(100, 999), 3);
      const part2 = generateRandomString(2);
      const part3 = padZeros(randomInt(1000000, 9999999), 7);
      const part4 = padZeros(randomInt(100000, 999999), 6);
      return `${part1}${part2}${part3}${part4}`;
    },
    generateDD: () => {
      // CA DD format
      const part1 = padZeros(randomInt(10, 999), 3);
      const part2 = padZeros(randomInt(100000, 999999), 6);
      const part3 = generateRandomString(2);
      const year = randomInt(18, 24);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      return `${part1}${part2}${part3}${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}D`;
    },
  },
};

export const generateDLNumber = (stateCode: StateCode): string => {
  const format = dlFormats[stateCode];
  if (!format) {
    throw new Error(`State code ${stateCode} not supported`);
  }
  return format.generate();
};

export const generateDLPackage = (stateCode: StateCode): DLPackage => {
  const format = dlFormats[stateCode];
  if (!format) {
    throw new Error(`State code ${stateCode} not supported`);
  }
  return {
    dlNumber: format.generate(),
    icn: format.generateICN(),
    dd: format.generateDD(),
  };
};

export const getStateName = (stateCode: StateCode): string => {
  return dlFormats[stateCode]?.state || "Unknown";
};

export const getStateFormat = (stateCode: StateCode): string => {
  return dlFormats[stateCode]?.format || "";
};

export const getAllStates = (): DLFormat[] => {
  return Object.values(dlFormats);
};

export const generateMultipleDLNumbers = (
  stateCode: StateCode,
  count: number
): string[] => {
  return Array.from({ length: count }, () => generateDLNumber(stateCode));
};

export const generateMultipleDLPackages = (
  stateCode: StateCode,
  count: number
): DLPackage[] => {
  return Array.from({ length: count }, () => generateDLPackage(stateCode));
};
