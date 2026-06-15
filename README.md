# Children's Climate Risk Report (CCRR) — Data Pipeline

This repository contains the data and scripts for the **Children's Climate Risk Report (CCRR)**, which provides insight into where children face the greatest climate hazard exposure and how vulnerable they are — drawing on 10 climate hazards, 17 child vulnerability indicators across 7 domains (health, nutrition, WASH, education, protection, poverty, and survival), and 2025 child population estimates.

---

## Repository Structure

```
CCRR/
├── Hazard_data_preparation/    # Stage 0: links to GCHD hazard prep notebooks
├── Multi_Hazard_Indicators/
│   ├── MHI/                    # Stage 1: Multi-Hazard Intensity raster (scripts + data)
│   ├── MHC/                    # Multi-Hazard Count methodology reference
│   └── Hazard_combination/     # Country-level co-occurrence analysis
├── Country_level_hazard_exposure/  # Stage 2: GEE exposure computation + output CSV
├── Vulnerability_data/         # vulnerability indicator CSVs + download notebook
├── CCRR_Pipeline/              # Stage 3: local Python pipeline (ccrr_pipeline.py + config)
└── misc/                       # Reference boundaries, classification tables, pipeline outputs
```

---

## Workflow Overview

The pipeline runs in four sequential stages.

### Stage 0 — Hazard Data Preparation
**Location:** [`Hazard_data_preparation/`](Hazard_data_preparation/)  
**Environment:** Google Colab / GEE  
**Run when:** Source hazard datasets are updated.

Individual notebooks download and process each raw hazard dataset and upload the results as GEE assets:

| Notebook | Hazard |
|---|---|
| `ASI_RP.ipynb` | Agricultural drought (FAO ASIS return level) |
| `Fire_90th_percentile.ipynb` | Fire frequency and intensity (NASA FIRMS) |
| `flood_download.ipynb` | River and coastal flood (JRC 100-year return) |
| `heatwave_RP.ipynb` | Heatwave frequency, duration, severity + extreme heat (ERA5/ECMWF) |
| `malaria_average.ipynb` | Malaria Pf and Pv prevalence (multi-year average) |
| `PM25_90th_percentile.ipynb` | Air pollution — PM2.5 90th percentile |
| `compute_SPI_SPEI.ipynb` | Meteorological drought — SPI-12 and SPEI-12 (TerraClimate) |
| `vulnerability_data_download.ipynb` | Vulnerability indicators (API download → `data/pillar2_data/`) |

---

### Stage 1 — MHI Pixel Raster Construction
**Location:** [`Multi_Hazard_Indicators/MHI/`](Multi_Hazard_Indicators/MHI/)  
**Environment:** GEE (export) + local Python (PCA)  
**Run when:** Hazard rasters are updated.

Builds the **Multi-Hazard Intensity (MHI)** index — a continuous 0–10 pixel-level score capturing combined hazard intensity.

| Script | Purpose |
|---|---|
| `MHI_input_gee.js` | Exports all climate hazard rasters + land-sea mask from GEE at ~0.1° resolution to `Multi_Hazard_Indicators/MHI/data/ccri_pixel/` |
| `mhi_construction.ipynb` | Applies log-transform → z-score normalization (land pixels only) → PCA weighting → MinMax scaling; outputs `Multi_Hazard_Indicators/MHI/data/MHI_climate.tif` |

The MHI raster is then uploaded to GEE as `projects/unicef-ccri/assets/hazards/MHI_climate` for use in Stage 2.

**Key inputs:** `Multi_Hazard_Indicators/MHI/data/ccri_pixel/*.tif` (climate hazard TIFs + `landSeaMask.tif`)  
**Output:** `Multi_Hazard_Indicators/MHI/data/MHI_climate.tif`

---

### Stage 2 — Country-Level Exposure
**Location:** [`Country_level_hazard_exposure/hazard_exposure_new.ipynb`](Country_level_hazard_exposure/hazard_exposure_new.ipynb)  
**Environment:** GEE (Python API)  
**Run when:** Hazard assets, MHI asset, or population data are updated.

Computes population-weighted exposure for each country using GEE `reduceRegions`. Produces a single CSV covering:

- Individual hazard binary exposure (16 hazards × absolute + relative)
- Multi-Hazard Category (MHC): children exposed to 1–8+ hazard categories
- Multi-Hazard Intensity (MHI): children above global p75/p80/p85/p90/p95 thresholds
- Total population and child population per country

**Key inputs (GEE assets):**
- 17 hazard layers with binary thresholds
- `MHI_climate` (continuous, percentile thresholds computed globally)
- Child population: `worldpop_T_U18_2025_CN_100m`
- General population: `worldpop_T_2025_CN_100m`
- Boundaries: `adm0_chunked_500km_shp`

**Output:** `Country_level_hazard_exposure/Hazard_Population_Exposure.csv`

---

### Stage 3 — CCRR Pipeline
**Location:** [`CCRR_Pipeline/`](CCRR_Pipeline/)  
**Environment:** Local Python  
**Run:** `python CCRR_Pipeline/ccrr_pipeline.py`  
**Config:** `CCRR_Pipeline/config.yaml`

A single Python script that runs five sequential steps:

| Step | Function | Output |
|---|---|---|
| 1 | Hazard data processing — normalize hazard exposure, apply force-null overrides | `misc/Merged_Exposure_Data.csv` |
| 2 | Vulnerability data processing — normalize vulnerability indicators, compute domain averages | `misc/P2_Merged_Normalized_avg.csv`, `misc/p2_group_mean.csv` |
| 3 | Indicator aggregation — group geometric means, combined score | `misc/p1_group_mean.csv`, `misc/p1_p2_avg_ccri.csv` |
| 4 | Quadrant classification — classify countries by two components relative to global median | `misc/ccri_quadrant_table.csv` |
| 5 | Formatting — merge all layers, apply MHI/MHC, produce final GeoJSON | `misc/CCRR_output.geojson` |

**Key inputs:**
- `Country_level_hazard_exposure/Hazard_Population_Exposure.csv`
- `Vulnerability_data/P2_*.csv`
- `misc/adm0.geojson`, `misc/adm0_boundaries_simple.geojson`
- `misc/p1_min_max.csv`, `misc/p2_min_max.csv`
- `misc/WB_INCOME.csv`, `misc/UNICEF_PROG_REG_GLOBAL.csv`
- `misc/List of fragile context (2025).csv`

**Final output:** `misc/CCRR_output.geojson`  
229 countries (195 States + 34 Territories), 162 columns including all hazard, vulnerability, MHI, MHC, and combined scores.

---

## Key Design Decisions

**Null handling:** Countries where a hazard model produces unreliable results are forced to null rather than zero. This propagates through the P1 geometric mean, leaving those countries without the combined score or quadrant classification. MHI and MHC values are also set to null for consistency. Affected countries:
- Fiji — river flood
- Federated States of Micronesia, Kiribati, Niue, Palau, Papua New Guinea, Marshall Islands, Samoa, Solomon Islands, Tonga, Tuvalu, Vanuatu — coastal flood

**Excluded countries:** Palestine (PSE) and Nicaragua (NIC) are retained in the output with all analytical values set to null.

**Territory inclusion:** Both sovereign states and territories are included (229 total). All are retained in the final output even if they have no hazard or vulnerability data.

**MHI methodology:** PCA is fitted on land pixels only. Ocean pixels are excluded entirely. NaN values in hazard layers are filled with 0 for land pixels before PCA, treating no-data as zero exposure.

---

## Running the Pipeline

```bash
# Activate the project environment
source .venv/bin/activate

# Run the full pipeline (Steps 1–5)
python CCRR_Pipeline/ccrr_pipeline.py
```

Stages 0, 1, and 2 require GEE authentication and are run separately in GEE or Colab environments.

---

## Citation

UNICEF (2026). *Children's Climate Risk Report (CCRR): Data Pipeline* [Computer software]. GitHub.

---

## Contact

**Dohyung Kim**  
Data Science Specialist, UNICEF Climate & Environment Data Unit  
dokim@unicef.org
