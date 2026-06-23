import { NextResponse } from "next/server";
import { fingerprintSecret } from "../../support/fingerprint-secret";

export const dynamic = "force-dynamic";

export function GET() {
  const runtimeSecret = process.env.RUNTIME_SECRET_TOKEN ?? "";

  return NextResponse.json({
    nextPublicBuildEnvName: process.env.NEXT_PUBLIC_BUILD_ENV_NAME ?? "unset",
    runtimeConfigName: process.env.RUNTIME_CONFIG_NAME ?? "unset",
    runtimeSecretFingerprint: fingerprintSecret(runtimeSecret),
  });
}
