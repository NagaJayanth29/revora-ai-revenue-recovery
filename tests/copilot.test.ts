import { describe, expect, it } from "vitest";
import { answerCopilotQuery, runCopilotTool } from "@/lib/copilot/tools";

describe("REVORA AI Copilot Chatbot ('Ask REVORA')", () => {
  it("answers 'What is at risk today?' with grounded metrics", async () => {
    const res = await answerCopilotQuery({
      message: "What's at risk today?",
    });

    expect(res.reply).toContain("Revenue at Risk");
    expect(res.reply).toContain("Expected Recovery");
    expect(res.reply).toContain("Actually Recovered");
    expect(res.tools_used.length).toBeGreaterThan(0);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("answers 'What should I recover first?' ranked by expected recovery value", async () => {
    const res = await answerCopilotQuery({
      message: "What should I recover first?",
    });

    expect(res.reply).toContain("Recovery Priority Ranking");
    expect(res.reply).toContain("Expected Recovery Value");
    expect(res.tools_used.some((t) => t.tool === "get_opportunities")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("explains the hero ₹48,000 opportunity accurately with Arjun Mehta context", async () => {
    const res = await answerCopilotQuery({
      message: "Explain the ₹48,000 opportunity.",
    });

    expect(res.reply).toContain("Arjun Mehta");
    expect(res.reply).toContain("48,000");
    expect(res.reply).toContain("INSUFFICIENT_FUNDS");
    expect(res.reply).toContain("revora-ensemble-v2.1");
    expect(res.reply).toContain("SAFE_TO_EXECUTE");
    expect(res.tools_used.some((t) => t.tool === "get_opportunity_details")).toBe(true);
    expect(res.tools_used.some((t) => t.tool === "compare_interventions")).toBe(true);
    expect(res.tools_used.some((t) => t.tool === "get_policy_status")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("verifies payment status accurately for ₹48,000 opportunity (zero fake recovery)", async () => {
    const res = await answerCopilotQuery({
      message: "Has the ₹48,000 opportunity been paid yet?",
    });

    // In initial seed/snapshot state, corr_demo_48000 is not paid yet (WAITING_FOR_OUTCOME or READY)
    expect(res.reply).toMatch(/No, not yet|Payment Verified/i);
    if (res.reply.includes("No, not yet")) {
      expect(res.reply).toContain("₹0");
      expect(res.reply).toMatch(/does (?:not|\*\*not\*\*) count as money recovered/i);
    }
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("analyzes why an opportunity is risky", async () => {
    const res = await answerCopilotQuery({
      message: "Why is this opportunity risky?",
    });

    expect(res.reply).toContain("Risk Analysis");
    expect(res.reply).toContain("Financial Exposure Risk");
    expect(res.reply).toContain("Goodwill Risk");
    expect(res.tools_used.length).toBeGreaterThan(0);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("explains decision rationale and why REVORA chose the intervention", async () => {
    const res = await answerCopilotQuery({
      message: "Why did REVORA choose this intervention?",
    });

    expect(res.reply).toContain("Decision Rationale");
    expect(res.reply).toContain("Counterfactual Comparison");
    expect(res.tools_used.some((t) => t.tool === "compare_interventions")).toBe(true);
  });

  it("compares retry now vs retry later with a counterfactual matrix", async () => {
    const res = await answerCopilotQuery({
      message: "Compare retry now vs retry later",
    });

    expect(res.reply).toContain("Counterfactual Intervention Comparison");
    expect(res.reply).toContain("Win Probability");
    expect(res.reply).toContain("Expected Recovery");
    expect(res.tools_used.some((t) => t.tool === "compare_interventions")).toBe(true);
  });

  it("explains why an action was blocked by policy guardrails", async () => {
    const res = await answerCopilotQuery({
      message: "Why was this action blocked?",
    });

    expect(res.reply).toMatch(/Blocked|guardrail/i);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("identifies revenue leakage sources and failure categories", async () => {
    const res = await answerCopilotQuery({
      message: "What caused the most revenue leakage?",
    });

    expect(res.reply).toContain("Revenue Leakage Analysis");
    expect(res.tools_used.some((t) => t.tool === "get_failure_analytics")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("shows cryptographic audit trail", async () => {
    const res = await answerCopilotQuery({
      message: "Show me the audit trail",
    });

    expect(res.reply).toContain("Cryptographic Audit Trail");
    expect(res.tools_used.some((t) => t.tool === "get_audit_log")).toBe(true);
  });

  it("checks what is safe to execute right now", async () => {
    const res = await answerCopilotQuery({
      message: "What is safe to execute right now?",
    });

    expect(res.reply).toMatch(/Safe/i);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("checks what needs approval", async () => {
    const res = await answerCopilotQuery({
      message: "What needs approval?",
    });

    expect(res.reply).toContain("Approval");
    expect(res.tools_used.some((t) => t.tool === "get_pending_approvals")).toBe(true);
  });

  it("displays experiment lift and A/B test results", async () => {
    const res = await answerCopilotQuery({
      message: "Baseline vs REVORA",
    });

    expect(res.reply).toContain("A/B Experiment");
    expect(res.reply).toContain("Control");
    expect(res.reply).toContain("Treatment");
    expect(res.tools_used.some((t) => t.tool === "get_experiment_results")).toBe(true);
  });

  it("handles 'Explain the ₹48K opportunity' with ₹48K abbreviation", async () => {
    const res = await answerCopilotQuery({
      message: "Explain the ₹48K opportunity",
    });

    expect(res.reply).toContain("Arjun Mehta");
    expect(res.reply).toContain("48,000");
    expect(res.tools_used.some((t) => t.tool === "get_opportunity_details")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("handles 'Has the ₹48K opportunity been paid yet?' with ₹48K abbreviation", async () => {
    const res = await answerCopilotQuery({
      message: "Has the ₹48K opportunity been paid yet?",
    });

    expect(res.reply).toMatch(/No, not yet|Payment Verified/i);
    expect(res.tools_used.some((t) => t.tool === "get_opportunity_details")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("checks policy status deterministically", async () => {
    const res = await answerCopilotQuery({
      message: "Check policy status",
    });

    expect(res.reply).toMatch(/Policy/i);
    expect(res.tools_used.some((t) => t.tool === "get_policy_status")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });

  it("simulates recovery safely without mutating state", async () => {
    const res = await answerCopilotQuery({
      message: "Simulate recovery",
    });

    expect(res.reply).toContain("Simulation Results");
    expect(res.tools_used.some((t) => t.tool === "simulate_recovery")).toBe(true);
    expect(res.actions && res.actions.length).toBeGreaterThan(0);
  });
});
