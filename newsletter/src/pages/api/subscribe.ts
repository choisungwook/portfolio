export const prerender = false;

import type { APIContext } from "astro";

export async function POST(context: APIContext) {
  const { email } = await context.request.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ message: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  const db = context.locals.runtime.env.DB;

  const existing = await db
    .prepare("SELECT id, unsubscribed_at FROM subscribers WHERE email = ?")
    .bind(email)
    .first();

  if (existing && !existing.unsubscribed_at) {
    return Response.json({ message: "이미 구독 중입니다." });
  }

  if (existing && existing.unsubscribed_at) {
    await db
      .prepare("UPDATE subscribers SET unsubscribed_at = NULL, confirmed = 1 WHERE email = ?")
      .bind(email)
      .run();
    return Response.json({ message: "다시 구독되었습니다." });
  }

  await db
    .prepare("INSERT INTO subscribers (email, confirmed) VALUES (?, 1)")
    .bind(email)
    .run();

  return Response.json({ message: "구독이 완료되었습니다." });
}
