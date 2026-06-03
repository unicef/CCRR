# Hazard Combination Analysis

Country-level analysis of which hazard combinations co-occur most frequently, used to inform CCRR narrative and policy messaging.

---

## Contents

| File | Description |
|---|---|
| `hazard_combination.ipynb` | Main analysis notebook — computes co-occurrence frequencies across 229 countries |
| `hazard_combination_analysis.ipynb` | Extended analysis — breakdowns by income group, region, and SIDS/LLDC classification |
| `HazardCombination_final.csv` | Final output: country × hazard-combination matrix |
| `hazard_combination_report.pdf` | Summary report of findings |

> Intermediate files (`HazardCombination_chunks.csv`, filtered CSVs, and PNGs) are gitignored — regenerate by running the notebooks.

---

## Input

The notebooks read from [`Country_level_hazard_exposure/Hazard_Population_Exposure.csv`](../../Country_level_hazard_exposure/Hazard_Population_Exposure.csv), which contains per-country exposure to each individual hazard.

---

## Key findings

The analysis identifies the most common multi-hazard combinations faced by children globally and by sub-group (income level, UNICEF region, SIDS, LLDC). Outputs are used to frame the CCRR narrative around compound risk.
