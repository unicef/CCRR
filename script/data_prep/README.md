# data_prep — Hazard Data Preparation & Country Exposure

This folder contains two types of scripts:

1. **Hazard preparation notebooks (Stage 0)** — download and process individual hazard datasets, uploading results as GEE assets. Run once per data update in Google Colab or a GEE-enabled environment.

2. **Country exposure notebook (Stage 2)** — computes country-level population exposure using the GEE Python API. Run after any hazard asset or population update.

---

## Stage 0 — Hazard Preparation

| Notebook | Hazard | Metric | GEE Asset Output |
|---|---|---|---|
| `ASI_RP.ipynb` | Agricultural drought (FAO ASIS) | 100-year return level via Gumbel EVT | `hazards/ASI_return_level_100yr` |
| `Fire_90th_percentile.ipynb` | Fire frequency & FRP intensity (NASA FIRMS) | 90th percentile | `hazards/FIRMS_count_90th_percentile`, `FIRMS_FRP_90th_percentile` |
| `flood_download.ipynb` | River and coastal flood (JRC) | 100-year return level | `hazards/river_flood_r100`, `coastal_flood_r100` |
| `heatwave_RP.ipynb` | Heatwave frequency, duration, severity + extreme heat (ERA5/ECMWF) | 100-year return level via Weibull | `hazards/heatwave_*_return_level_100yr`, `high_temp_degree_days_return_level_100yr` |
| `malaria_average.ipynb` | Malaria Pf and Pv prevalence | Multi-year average (2013–2022) | `hazards/Pf_average_2013_2022`, `Pv_average_2013_2022` |
| `PM25_90th_percentile.ipynb` | Air pollution — PM2.5 | 90th percentile (1998–2023) | `hazards/pm25_p90_1998_2023` |
| `compute_SPI_SPEI.ipynb` | Meteorological drought — SPI-12 and SPEI-12 (TerraClimate) | Drought probability layers (1958–2025) | `droughts/spi12_TerraClimate_1958-2025`, `droughts/spei12_TerraClimate_1958-2025` |
| `vulnerability_data_download.ipynb` | Pillar 2 vulnerability indicators | Latest available observation (UNICEF SDMX API) | `data/pillar2_data/P2_*.csv` |

---

### `heatwave_RP.ipynb` — Heatwave Indicators

Heatwave frequency, duration, severity, and extreme heat degree-days are computed from ERA5 reanalysis data. The full methodology and source code are maintained in a separate repository:

**[https://github.com/unicef/heat](https://github.com/unicef/heat)**

That repository contains the complete pipeline for deriving heatwave indicators from ERA5, fitting Weibull extreme value distributions, and computing 100-year return levels. The GEE assets produced are used directly in `hazard_exposure_new.ipynb`.

---

### `compute_SPI_SPEI.ipynb` — TerraClimate SPI/SPEI Pipeline

> **Note on data source selection:** An earlier version (`SPI_SPEI_average.ipynb`) used pre-computed SPI/SPEI from the ECMWF Copernicus CDS (`derived-drought-historical-monthly`, ERA5-based, 0.25°). It was replaced by the TerraClimate approach because the ECMWF dataset had insufficient spatial coverage in small island areas. TerraClimate provides finer resolution (~4 km) and better coverage for SIDS, which is critical for this index.

---

### `compute_SPI_SPEI.ipynb` — TerraClimate SPI/SPEI Pipeline

Computes SPI-12 and SPEI-12 from raw TerraClimate monthly data. Run in **Google Colab with A100 GPU** (`Runtime → Change runtime type → A100 GPU`).

**Dependency:** requires the `precip-index` library stored on Google Drive at `DRIVE_REPO_PATH/src/`. Set `DRIVE_REPO_PATH` in the configuration cell before running.

**Steps:**
1. Download TerraClimate `ppt` (precipitation) and `pet` (potential evapotranspiration) NetCDF files for 1958–2025; files are cached to Drive after first download to avoid re-downloading
2. Convert per-year NC files to a single Zarr store (Blosc/zstd compressed, chunked for spatial tiling)
3. Compute SPI-12 and SPEI-12 pixel-wise using gamma distribution fitted on the 1991–2020 WMO calibration period; GPU-accelerated with CuPy; checkpoint resume on session crash
4. Generate probability layers and quality flag, write as 4-band Cloud-Optimised GeoTIFF

**Output GeoTIFF bands:**

| Band | Name | Description |
|---|---|---|
| 1 | `prob_{index}_neg1p0` | P(index ≤ −1.0) — moderate drought or worse |
| 2 | `prob_{index}_neg1p5` | P(index ≤ −1.5) — severe drought or worse |
| 3 | `prob_{index}_neg2p0` | P(index ≤ −2.0) — extreme drought |
| 4 | `quality_flag` | 1 = high / 2 = medium / 3 = low (based on precipitation record length and amount) |

**Outputs** (saved to `DRIVE_REPO_PATH/output/colab/`, then manually uploaded to GEE):
- `spi12_prob_quality.tif` → `projects/unicef-ccri/assets/droughts/spi12_TerraClimate_1958-2025`
- `spei12_prob_quality.tif` → `projects/unicef-ccri/assets/droughts/spei12_TerraClimate_1958-2025`

---

## Stage 2 — Country Exposure

### `hazard_exposure_new.ipynb`

Computes population-weighted exposure for all countries using GEE `reduceRegions`. All 17 hazards, MHI percentile exposure, and population totals are computed in a single run and exported as one CSV.

**Requires:** GEE Python API authentication (`ee.Initialize(project='unicef-ccri')`)

**Inputs (GEE assets):**
- All 17 hazard assets listed above
- `MHI_climate` — pixel-level multi-hazard intensity raster (from Stage 1, `script/multi_hazard/`)
- Child population: `projects/unicef-ccri/assets/population/worldpop_T_U18_2025_CN_100m`
- General population: `projects/unicef-ccri/assets/population/worldpop_T_2025_CN_100m`
- Country boundaries: `projects/unicef-ccri/assets/global_boundary/adm0_chunked_500km_shp`

**Output:** `data/pillar1_data/Hazard_Population_Exposure.csv`

Key output columns:
- `ucode` — boundary unit code (linked to ISO3 via `data/misc/adm0.geojson`)
- `pop_child_total`, `pop_total` — child and general population per unit
- `pop_exposed_{hazard}` — children exposed above binary threshold, 17 hazards
- `pop_topic_ge_{1–8}` — children exposed to 1–8+ hazard categories (Multi-Hazard Category, MHC)
- `pop_exposed_{drought/heatwave/fire}_topic` — topic-level union exposures
- `pop_mhi_p{75/80/85/90/95}` — children above global MHI percentile thresholds
