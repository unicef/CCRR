# CCRR Pipeline (Stage 3)

This folder contains the local Python pipeline that computes all CCRR scores from pre-processed hazard exposure and vulnerability data.

**Run:** `python CCRR_Pipeline/ccrr_pipeline.py`  
**Config:** `CCRR_Pipeline/config.yaml`  
**Environment:** `.venv` at repo root (`source .venv/bin/activate`)

---

## Scripts

### `ccrr_pipeline.py`

Runs five sequential steps. Each step reads from intermediate files written by the previous step.

| Step | Function | Description |
|---|---|---|
| 1 | `run_pillar1()` | Normalize hazard exposure to 1–10; apply force-null overrides |
| 2 | `run_pillar2()` | Normalize vulnerability indicators to 0–10; compute domain means |
| 3 | `run_aggregation()` | Group geometric means → P1/P2 composite scores |
| 4 | `run_quadrant()` | Classify countries into 4 quadrants by P1/P2 vs. global median |
| 5 | `run_formatting()` | Merge all layers, apply MHI/MHC, rename columns, write final GeoJSON |

---

### `config.yaml`

All configuration for the pipeline. Key sections:

#### `paths`
All input and output file paths (relative to repo root).

Key inputs:
- `hazard_exposure_csv` — `Country_level_hazard_exposure/Hazard_Population_Exposure.csv` (from Stage 2)
- `p1_min_max_csv` / `p2_min_max_csv` — fixed global normalization ranges (in `CCRR_Pipeline/`)
- `pillar2_data_dir` — `Vulnerability_data/` directory of `P2_*.csv` files
- `adm0_geojson` — country boundaries with ISO3 and type (State/Territory)

Key outputs (intermediate and final):
- `merged_exposure_csv` — normalized P1 data
- `p2_merged_csv` — normalized P2 data
- `p1_group_mean_csv`, `p2_group_mean_csv` — component-level scores
- `p1_p2_avg_csv` — composite CCRI scores per country
- `quadrant_csv` — P1/P2 quadrant classification
- `ccri_format_geojson` — **final output** with all columns

#### `pillar1`
- `normalization_range: [1, 10]` — absolute and relative exposure normalized to this range
- `absolute_log_threshold: 100` — absolute exposure values ≤ 100 floored to 0.1 before log₁₀
- `zero_fill_cols` — hazards where NaN child exposure is treated as 0 (no population exposed)
- `force_null` — country-hazard pairs forced to null (see below)
- `hazard_groups` — groups of individual hazard indicators that are aggregated by geometric mean into a single group score (used for P1 composite)
- `p1_score_range: [0, 10]` — final P1 score range after group aggregation

#### `pillar2`
- `normalization_range: [0, 10]`
- `time_period_min: 2015` — only data from 2015 onward is used
- `coverage_threshold: 0.4` — countries with fewer than 40% of P2 indicators present get no P2 score
- `reverse_columns` — indicators where higher raw value = better outcome; reversed after normalization so 10 = most vulnerable
- `domains` — 7 domain groupings: health, nutrition, wash, education, protection, poverty, survival; each domain score = arithmetic mean of its indicators

#### `formatting`
- `exclude_iso3: [PSE, NIC]` — these countries are retained in the output but all data columns are set to null
- `mhi_abs_cols` — MHI/MHC absolute exposure columns capped at `u18_pop` to correct raster aggregation artifacts
- `p1_col_renames`, `p2_col_renames` — maps from full indicator names to short column codes used in the final GeoJSON
- `p1_component_renames`, `p2_component_renames` — maps from group/domain names to `P1_xxx` / `P2_xxx` column codes
- `output_columns` — ordered list of all columns in the final GeoJSON (162 total)

---

## Null handling and force_null

Countries where a specific hazard model produces unreliable results are forced to null via `force_null` in `config.yaml`:

| Country | Hazard forced null |
|---|---|
| Fiji (FJI) | River flood |
| FSM, KIR, NIU, PLW, PNG, MHL, WSM, SLB, TON, TUV, VUT | Coastal flood |

**Propagation chain:**
1. `run_pillar1()` sets the normalized columns (e.g. `river_flood_absolute`, `river_flood_relative`) to NaN for the affected country
2. `run_aggregation()` computes the group geometric mean — NaN in any component propagates to NaN group score
3. NaN group score propagates to `P1_geometric_avg = NaN`
4. `run_quadrant()` excludes countries with NaN P1 — no quadrant assigned
5. `run_formatting()` nulls all MHI/MHC columns for any country with `P1_geometric_avg = NaN`
6. Raw abs/rel columns for the forced-null hazard are also set to null in the final output

---

## Output

**`misc/CCRR_output.geojson`**

229 countries (195 States + 34 Territories), 162 columns:

- `iso3`, `adm_name`, `total_pop`, `u18_pop`, `wb_income`, `unicef_ro`, `type`, `fragile`
- Per-hazard raw and normalized exposure: `{code}_abs`, `{code}_rel`, `{code}_abs_norm`, `{code}_rel_norm` (16 hazards × 4 = 64 columns)
- Per-indicator vulnerability: `{code}`, `{code}_norm` (17 indicators × 2 = 34 columns)
- P1 group component scores: `P1_rfl`, `P1_cfl`, `P1_ts`, `P1_dr`, `P1_hw`, `P1_ext`, `P1_fr`, `P1_sds`, `P1_pm25`, `P1_mal`
- P2 domain scores: `P2_hea`, `P2_nut`, `P2_wash`, `P2_edu`, `P2_pro`, `P2_pov`, `P2_sur`
- `P1_geometric_avg`, `P2_arithmetic_avg`, `P2_missing_val`
- MHI: `mhi_TH75/80/85/90/95_abs/rel` (10 columns)
- MHC: `mhc_ge1–8_abs/rel` (16 columns)
- Topic exposures: `drought_topic_abs/rel`, `heatwave_topic_abs/rel`, `fire_topic_abs/rel`
- `CCRI_Quadrant`
