import { connection } from "next/server";
import { ClientEnvCard } from "./components/client-env-card";
import { fingerprintSecret } from "./support/fingerprint-secret";

export default async function Home() {
  await connection();

  const runtimeConfigName = process.env.RUNTIME_CONFIG_NAME ?? "unset";
  const runtimeSecret = process.env.RUNTIME_SECRET_TOKEN ?? "";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "40px", lineHeight: 1.6 }}>
      <h1>EKS Next.js env Secret demo</h1>
      <p>
        브라우저 bundle에 들어간 값과 서버 runtime에서 읽는 값을 같은 화면에서 비교합니다.
      </p>

      <section>
        <h2>build-time public env</h2>
        <ClientEnvCard />
      </section>

      <section>
        <h2>runtime server env</h2>
        <dl>
          <dt>RUNTIME_CONFIG_NAME</dt>
          <dd>{runtimeConfigName}</dd>
          <dt>RUNTIME_SECRET_TOKEN fingerprint</dt>
          <dd>{fingerprintSecret(runtimeSecret)}</dd>
        </dl>
      </section>
    </main>
  );
}
