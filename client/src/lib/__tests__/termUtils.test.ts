import { describe, expect, it } from "vitest";
import type { TermDefinition } from "../../state/AppState";
import { dedupeTermDefinitions } from "../termUtils";

const term = (overrides: Partial<TermDefinition>): TermDefinition => ({
  term: "Sample",
  definition: "Definition",
  ...overrides,
});

describe("dedupeTermDefinitions", () => {
  it("removes duplicates case-insensitively while preserving original casing", () => {
    const input: TermDefinition[] = [
      term({ term: "AI", definition: "Short" }),
      term({ term: "ai", definition: "Detailed explanation", definition_cn: "人工智能" }),
      term({ term: "AI", definition: "Another" }),
    ];

    const result = dedupeTermDefinitions(input);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("AI");
    expect(result[0].definition).toBe("Detailed explanation");
    expect(result[0].definition_cn).toBe("人工智能");
  });

  it("prefers entries with longer definitions when no bilingual value is provided", () => {
    const result = dedupeTermDefinitions([
      term({ term: "Cloud", definition: "Short" }),
      term({ term: "cloud", definition: "A distributed infrastructure delivering on-demand compute resources." }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].definition).toBe(
      "A distributed infrastructure delivering on-demand compute resources.",
    );
  });

  it("drops entries missing required fields and trims remaining data", () => {
    const result = dedupeTermDefinitions([
      term({ term: "  Data Fabric  ", definition: "  Layer that manages data governance.  " }),
      term({ term: "", definition: "Should be ignored" }),
      term({ term: "Data Fabric", definition: "Layer that manages data governance.", definition_cn: " 数据织体 " }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("Data Fabric");
    expect(result[0].definition).toBe("Layer that manages data governance.");
    expect(result[0].definition_cn).toBe("数据织体");
  });
});
