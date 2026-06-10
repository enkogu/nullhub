import type { LoopTemplate } from "./templates";

export type { LoopTemplate };

export const builtinLoopTemplates: LoopTemplate[] = [
  {
    slug: "ship-pr-until-green",
    name: "Ship PR Until Green",
    category: "Development",
    machine: "Code Machine",
    tagline: "Drive a pull request until CI is green and it is ready to merge.",
    goal: "The pull request builds, passes CI, and has review feedback addressed.",
    exitCondition: "CI is green and no blocking review feedback remains.",
    checkInstruction: "Run the CI checks for the branch. If anything fails, fix it, push, and check again.",
    maxIterations: 8,
    starter: {
      title: "Ship PR until green",
      description:
        "Take the referenced branch or pull request, run its CI checks, fix every failure, and push until CI is green and the PR is ready to merge. Record what was fixed on each attempt.",
      priority: 70,
    },
  },
  {
    slug: "test-until-green",
    name: "Test Until Green",
    category: "Development",
    machine: "Test Machine",
    tagline: "Run the test suite, fix failures, repeat until everything passes.",
    goal: "The full test suite passes on the current working tree.",
    exitCondition: "Every test in the suite passes.",
    checkInstruction: "Run the full test suite. If any test fails, fix the cause and run the suite again.",
    maxIterations: 6,
    starter: {
      title: "Run tests until green",
      description:
        "Run the project test suite, fix each failure at its root cause, and repeat until the whole suite passes. Summarize the failures fixed per attempt.",
      priority: 70,
    },
  },
  {
    slug: "pr-self-review",
    name: "PR Self-Review",
    category: "Development",
    machine: "Code Machine",
    tagline: "Review a diff, apply findings, re-review until nothing blocking remains.",
    goal: "The diff has been reviewed and all blocking findings are resolved.",
    exitCondition: "A review pass produces no blocking findings.",
    checkInstruction: "Review the current diff for correctness, security, and quality. Apply fixes for blocking findings, then review again.",
    maxIterations: 4,
    starter: {
      title: "Self-review current diff",
      description:
        "Review the current branch diff for bugs, security issues, and quality problems. Apply fixes for every blocking finding and re-review until a pass comes back clean.",
      priority: 60,
    },
  },
  {
    slug: "research-brief-until-cited",
    name: "Research Brief Until Cited",
    category: "Research",
    machine: "Research Machine",
    tagline: "Research a topic until every claim in the brief has a source.",
    goal: "A complete research brief where every claim is backed by a citation.",
    exitCondition: "The brief covers the question and every claim cites a verifiable source.",
    checkInstruction: "Read the brief, list uncited or weak claims, research them, and update the brief. Repeat until no uncited claims remain.",
    maxIterations: 5,
    starter: {
      title: "Research brief until cited",
      description:
        "Produce a research brief on the given topic. After each draft, audit every claim for a citation, research the gaps, and revise until all claims are cited.",
      priority: 60,
    },
  },
  {
    slug: "source-verification",
    name: "Source Verification Loop",
    category: "Research",
    machine: "Research Machine",
    tagline: "Verify each source and repair weak claims until coverage is solid.",
    goal: "Every key claim is verified against at least one solid source.",
    exitCondition: "All key claims are confirmed or corrected with verified sources.",
    checkInstruction: "Check each claim against its sources. Replace dead or weak sources, correct claims that fail verification, then check again.",
    maxIterations: 5,
    starter: {
      title: "Verify sources for document",
      description:
        "Go through the referenced document claim by claim, verify each against its sources, replace weak or dead sources, and correct anything that fails verification.",
      priority: 50,
    },
  },
  {
    slug: "social-post-until-publishable",
    name: "Social Post Until Publishable",
    category: "Content",
    machine: "Content Machine",
    tagline: "Draft and polish posts until they meet the publishing bar.",
    goal: "A post batch that is on-brand, accurate, and ready to publish.",
    exitCondition: "Every post in the batch passes the publishable checklist.",
    checkInstruction: "Check each draft against the brand voice and accuracy checklist. Rewrite drafts that fail and check again.",
    maxIterations: 4,
    starter: {
      title: "Draft posts until publishable",
      description:
        "Draft the requested social posts, check each against brand voice, accuracy, and format rules, and rewrite until the whole batch is publishable.",
      priority: 50,
    },
  },
  {
    slug: "lead-follow-up",
    name: "Lead Follow-Up Loop",
    category: "Sales & CRM",
    machine: "CRM Machine",
    tagline: "Follow up with a lead until they reply or the lead is closed.",
    goal: "The lead has replied or is explicitly closed with a recorded outcome.",
    exitCondition: "A reply is received or the lead is marked closed.",
    checkInstruction: "Check for a reply from the lead. If none, send the next follow-up in the sequence and record it. Stop when a reply arrives or the sequence is exhausted.",
    maxIterations: 10,
    starter: {
      title: "Follow up with lead",
      description:
        "Work the referenced lead: check for replies, send the next follow-up when there is none, and log every touch until the lead replies or is closed.",
      priority: 50,
    },
  },
  {
    slug: "deploy-verification",
    name: "Deploy Verification Loop",
    category: "Operations",
    machine: "DevOps Machine",
    tagline: "Verify a deploy until smoke checks pass and the release is stable.",
    goal: "The deployed version passes smoke checks and is confirmed stable.",
    exitCondition: "All smoke checks pass against the deployed version.",
    checkInstruction: "Run the smoke checks against the deployment. If any fail, diagnose, apply the fix or rollback, and run the checks again.",
    maxIterations: 5,
    starter: {
      title: "Verify deploy until stable",
      description:
        "Verify the referenced deployment: run smoke checks, diagnose and fix any failures (or escalate for rollback), and re-check until the release is stable.",
      priority: 80,
    },
  },
];
