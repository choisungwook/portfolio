import { describe, expect, it } from "vitest";
import {
  defaultAiSettings,
  normalizeAiSettings,
  SUMMARY_SYSTEM_PROMPT,
} from "../ui/src/ai-settings";

describe("AI settings", () => {
  it("normalizes invalid preview settings to Luna low", () => {
    expect(normalizeAiSettings({
      version: 99,
      provider: "local",
      model: "unknown",
      effort: "max",
      systemPrompt: null,
    })).toEqual(defaultAiSettings());
  });

  it("keeps supported models and trims prompts", () => {
    const settings = normalizeAiSettings({
      model: "gpt-5.6-terra",
      systemPrompt: "  페이지를 요약해 줘  ",
    });
    expect(settings.model).toBe("gpt-5.6-terra");
    expect(settings.effort).toBe("low");
    expect(settings.systemPrompt).toBe("페이지를 요약해 줘");
    expect(normalizeAiSettings({ systemPrompt: "  " }).systemPrompt).toBe(SUMMARY_SYSTEM_PROMPT);
  });
});
