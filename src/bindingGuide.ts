import type { Project } from "./model";

const text = (value: string) =>
  value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\`*_{}\[\]<>|]/g, "\\$&")
    .trim();
/** Current structured reviews survive reopening and do not depend on historical prose in notes. */
export function bindingGuideMarkdown(project: Project) {
  if (!project.ideaBindings.length) return "";
  return (
    "\n\n## Saved design reviews\n\nCurrent saved assumptions and open decisions for the applied designs. Actual part dimensions and cuts are listed in the build sequence.\n\n" +
    project.ideaBindings
      .map((binding) =>
        [
          `### ${text(binding.title)} · revision ${binding.revision}`,
          `Assemblies: ${binding.entries.map((entry) => text(entry.spec.type === "furniture" ? entry.spec.recipe.name : entry.spec.structure.kind.replaceAll("-", " "))).join("; ")}.`,
          ...binding.assumptions.map(
            (assumption) => `- Assumption: ${text(assumption)}`,
          ),
          ...binding.questions.map(
            (question) => `- Open decision: ${text(question)}`,
          ),
          ...binding.suggestions.map(
            (suggestion) => `- Review: ${text(suggestion)}`,
          ),
        ].join("\n"),
      )
      .join("\n\n")
  );
}
