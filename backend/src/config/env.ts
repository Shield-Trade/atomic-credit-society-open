import dotenv from "dotenv";
import type { SettlementAsset } from "../types/domain";

dotenv.config();

function readSettlementAsset(): SettlementAsset {
  const raw = (process.env.DEMO_SETTLEMENT_ASSET ?? "USDT").toUpperCase();
  if (raw === "USDT" || raw === "USAT" || raw === "XAUT" || raw === "BTC") {
    return raw;
  }
  return "USDT";
}

function toNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const value = Number(input);
  if (Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function parseWdkProvider(): "mock" | "real" {
  const provider = (process.env.WDK_PROVIDER ?? "mock").trim().toLowerCase();
  if (provider === "real") {
    return "real";
  }
  return "mock";
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  wdkProvider: parseWdkProvider(),
  settlementAsset: readSettlementAsset(),
  autonomyEnabled: process.env.AUTONOMY_ENABLED !== "false",
  wdkEvmRpcUrl: process.env.WDK_EVM_RPC_URL?.trim() ?? "",
  wdkEvmTransferMaxFeeWei: process.env.WDK_EVM_TRANSFER_MAX_FEE_WEI?.trim() ?? "",
  wdkEvmTokenUsdt: process.env.WDK_EVM_TOKEN_USDT?.trim() ?? "",
  wdkEvmTokenUsat: process.env.WDK_EVM_TOKEN_USAT?.trim() ?? "",
  wdkEvmTokenXaut: process.env.WDK_EVM_TOKEN_XAUT?.trim() ?? "",
  wdkEvmDecimalsUsdt: toNumber(process.env.WDK_EVM_DECIMALS_USDT, 6),
  wdkEvmDecimalsUsat: toNumber(process.env.WDK_EVM_DECIMALS_USAT, 6),
  wdkEvmDecimalsXaut: toNumber(process.env.WDK_EVM_DECIMALS_XAUT, 6),
  wdkRealTreasurySeedPhrase: process.env.WDK_REAL_TREASURY_SEED_PHRASE?.trim() ?? ""
};
