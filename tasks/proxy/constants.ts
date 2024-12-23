import { PublicKey } from "@solana/web3.js";

export const PROXY_AUTHORITY_SEED = "ProxyAuthority";

export const ENV: "DEV" | "QA" | "STAGING" | "MAIN" = "DEV";
export const DEV_PROXY_PROGRAM_ID = new PublicKey("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");
export const QA_PROXY_PROGRAM_ID = new PublicKey("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");
export const STAGING_PROXY_PROGRAM_ID = new PublicKey("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");
export const MAIN_PROXY_PROGRAM_ID = new PublicKey("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");