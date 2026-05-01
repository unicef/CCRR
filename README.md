# Children's Climate Risk Report (CCRR) — Data Pipeline

This repository contains the data and scripts for constructing the **Children's Climate Risk Index (CCRI)**, a country-level index measuring children's exposure to climate hazards (Pillar 1) and their underlying vulnerability (Pillar 2).

---

## Repository Structure

```
CCRR/
├── script/
│   ├── data_prep/          # Stage 0 & 2: hazard data preparation + country exposure (GEE)
│   ├── data_processing/    # Stage 3: CCRI pipeline (local Python)
│   └── multi_hazard/       # Stage 1: Multi-Hazard Intensity (MHI) raster construction
├── data/
│   ├── pillar1_data/       # Country-level hazard exposure CSV (main pipeline input)
│   ├── pillar2_data/       # Child vulnerability indicator CSVs
│   ├── misc/               # Reference files, normalization ranges, intermediate outputs
│   └── CCRI_results_misc/  # MHI pixel raster output
└── misc/                   # Supporting documentation
```

---

## Workflow Overview

The pipeline runs in four sequential stages.

### Stage 0 — Hazard Data Preparation
**Location:** `script/data_prep/`  
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
| `vulnerability_data_download.ipynb` | Pillar 2 vulnerability indicators (API download → `data/pillar2_data/`) |

---

### Stage 1 — MHI Pixel Raster Construction
**Location:** `script/multi_hazard/`  
**Environment:** GEE (export) + local Python (PCA)  
**Run when:** Hazard rasters are updated.

Builds the **Multi-Hazard Intensity (MHI)** index — a continuous 0–10 pixel-level score capturing combined hazard intensity.

| Script | Purpose |
|---|---|
| `MHI_input_gee.js` | Exports 13 hazard rasters + land-sea mask from GEE at ~0.1° resolution to `data/misc/ccri_pixel/` |
| `mhi_construction.ipynb` | Applies log-transform → z-score normalization (land pixels only) → PCA weighting → MinMax scaling; outputs `data/CCRI_results_misc/MHI_climate.tif` |

The MHI raster is then uploaded to GEE as `projects/unicef-ccri/assets/hazards/MHI_climate` for use in Stage 2.

**Key inputs:** `data/misc/ccri_pixel/*.tif` (13 hazard TIFs + `landSeaMask.tif`)  
**Output:** `data/CCRI_results_misc/MHI_climate.tif`

---

### Stage 2 — Country-Level Exposure
**Location:** `script/data_prep/hazard_exposure_new.ipynb`  
**Environment:** GEE (Python API)  
**Run when:** Hazard assets, MHI asset, or population data are updated.

Computes population-weighted exposure for each country using GEE `reduceRegions`. Produces a single CSV covering:

- Individual hazard binary exposure (17 hazards × absolute + relative)
- Multi-Hazard Category (MHC): children exposed to 1–8+ hazard categories
- Multi-Hazard Intensity (MHI): children above global p75/p80/p85/p90/p95 thresholds
- Total population and child population per country

**Key inputs (GEE assets):**
- 17 hazard layers with binary thresholds
- `MHI_climate` (continuous, percentile thresholds computed globally)
- Child population: `worldpop_T_U18_2025_CN_100m`
- General population: `worldpop_T_2025_CN_100m`
- Boundaries: `adm0_chunked_500km_shp`

**Output:** `data/pillar1_data/Hazard_Population_Exposure.csv`

---

### Stage 3 — CCRI Pipeline
**Location:** `script/data_processing/`  
**Environment:** Local Python  
**Run:** `python script/data_processing/ccri_pipeline.py`  
**Config:** `script/data_processing/config.yaml`

A single Python script that runs five sequential steps:

| Step | Function | Output |
|---|---|---|
| 1 | Pillar 1 processing — normalize hazard exposure, apply force-null overrides | `data/misc/Merged_Exposure_Data.csv` |
| 2 | Pillar 2 processing — normalize vulnerability indicators, compute domain averages | `data/misc/P2_Merged_Normalized_avg.csv`, `data/misc/p2_group_mean.csv` |
| 3 | P1 + P2 aggregation — group geometric means, combined CCRI score | `data/misc/p1_group_mean.csv`, `data/misc/p1_p2_avg_ccri.csv` |
| 4 | Quadrant classification — classify countries by P1/P2 relative to global median | `data/misc/ccri_quadrant_table.csv` |
| 5 | Formatting — merge all layers, apply MHI/MHC, produce final GeoJSON | `data/misc/CCRI_P1_P2_format.geojson` |

**Key inputs:**
- `data/pillar1_data/Hazard_Population_Exposure.csv`
- `data/pillar2_data/P2_*.csv`
- `data/misc/adm0.geojson`, `data/misc/adm0_boundaries_simple.geojson`
- `data/misc/p1_min_max.csv`, `data/misc/p2_min_max.csv`
- `data/misc/WB_INCOME.csv`, `data/misc/UNICEF_PROG_REG_GLOBAL.csv`
- `data/misc/List of fragile context (2025).csv`

**Final output:** `data/misc/CCRI_P1_P2_format.geojson`  
229 countries (195 States + 34 Territories), 162 columns including all hazard, vulnerability, MHI, MHC, and CCRI scores.

---

## Key Design Decisions

**Null handling:** Countries where a hazard model produces unreliable results are forced to null rather than zero. This propagates through the P1 geometric mean, leaving those countries without a CCRI score or quadrant classification. MHI and MHC values are also set to null for consistency. Affected countries:
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
python script/data_processing/ccri_pipeline.py
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
