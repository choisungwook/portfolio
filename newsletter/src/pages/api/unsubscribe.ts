export const prerender = false;

import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const email = context.url.searchParams.get("email");

  if (!email) {
    return new Response("이메일 파라미터가 필요합니다.", { status: 400 });
  }

  const db = context.locals.runtime.env.DB;
  await db
    .prepare("UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE email = ?")
    .bind(email)
    .run();

  return new Response(
    `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>구독이 해제되었습니다.</h2>
      <p>${email}의 구독이 해제되었습니다.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}
