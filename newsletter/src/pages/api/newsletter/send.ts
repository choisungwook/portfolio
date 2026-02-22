export const prerender = false;

import type { APIContext } from "astro";
import { Resend } from "resend";

export async function POST(context: APIContext) {
  const authHeader = context.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return Response.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const decoded = atob(authHeader.slice(6));
  const [, password] = decoded.split(":");
  const env = context.locals.runtime.env;

  if (password !== env.ADMIN_PASSWORD) {
    return Response.json({ message: "비밀번호가 틀렸습니다." }, { status: 403 });
  }

  const { subject, html } = await context.request.json();
  if (!subject || !html) {
    return Response.json({ message: "제목과 본문을 입력하세요." }, { status: 400 });
  }

  const db = env.DB;
  const subscribers = await db
    .prepare("SELECT email FROM subscribers WHERE confirmed = 1 AND unsubscribed_at IS NULL")
    .all();

  const emails = (subscribers.results ?? []).map((s: any) => s.email as string);
  if (emails.length === 0) {
    return Response.json({ message: "구독자가 없습니다." }, { status: 400 });
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.NEWSLETTER_FROM || "newsletter@akbun.com";

  let sent = 0;
  let failed = 0;

  const batchSize = 50;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((to) =>
        resend.emails.send({ from, to, subject, html })
      )
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") sent++;
      else failed++;
    });
  }

  return Response.json({
    message: `발송 완료: 성공 ${sent}건, 실패 ${failed}건`,
    sent,
    failed,
  });
}
