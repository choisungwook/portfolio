"use client";

const publicBuildEnvName = process.env.NEXT_PUBLIC_BUILD_ENV_NAME ?? "unset";

export function ClientEnvCard() {
  return (
    <dl>
      <dt>NEXT_PUBLIC_BUILD_ENV_NAME</dt>
      <dd>{publicBuildEnvName}</dd>
    </dl>
  );
}
