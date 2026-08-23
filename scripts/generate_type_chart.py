"""Generate web/src/core/typeChart.ts from typechart.csv (Gen 6+ type chart).

The CSV is the source of truth; this script is rerunnable and rebuilds the
TypeScript file from scratch each time. Type names are lowercased to match
PokeAPI's convention, which is what species/move type data uses at runtime.
"""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "typechart.csv"
OUTPUT_PATH = ROOT / "web" / "src" / "core" / "typeChart.ts"


def main():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        defending_types = [h.strip().lower() for h in header[1:]]
        rows = [row for row in reader if row]

    lines = [
        "// Generated from typechart.csv by scripts/generate_type_chart.py — do not edit by hand.",
        "",
        "export const TYPE_CHART: Record<string, Record<string, number>> = {",
    ]
    for row in rows:
        attacking_type = row[0].strip().lower()
        values = row[1:]
        pairs = ", ".join(
            f'"{dtype}": {value}' for dtype, value in zip(defending_types, values)
        )
        lines.append(f'  "{attacking_type}": {{ {pairs} }},')
    lines.append("};")
    lines.append("")
    lines.append(
        "export function getTypeEffectiveness(attackingType: string, defendingType: string): number {"
    )
    lines.append("  return TYPE_CHART[attackingType]?.[defendingType] ?? 1;")
    lines.append("}")
    lines.append("")

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} ({len(rows)} attacking types)")


if __name__ == "__main__":
    main()
