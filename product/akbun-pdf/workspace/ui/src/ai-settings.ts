import type { AiModel, AiSettings } from "./types";

export const SUMMARY_SYSTEM_PROMPT = [
  "사용자가 지정한 PDF 페이지를 요약한다.",
  "문서의 언어를 유지하고 핵심 주장, 근거, 수치, 결정, 후속 조치를 구분한다.",
  "각 내용의 근거가 되는 페이지 번호를 표시한다.",
  "페이지 이미지와 추출 텍스트가 다르면 이미지에서 확인되는 내용을 우선하되, 보이지 않거나 불확실한 내용은 추측하지 않는다.",
  "여러 묶음의 중간 요약을 받으면 중복을 제거하고 문서의 전체 흐름을 보존한 최종 요약을 작성한다.",
].join(" ");

export const AI_MODELS: ReadonlyArray<{ id: AiModel; label: string }> = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
];

export function defaultAiSettings(): AiSettings {
  return {
    version: 1,
    provider: "codex",
    model: "gpt-5.6-luna",
    effort: "low",
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
  };
}
