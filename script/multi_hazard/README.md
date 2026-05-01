# multi_hazard — MHI Pixel Raster Construction

This folder contains scripts for building the **Multi-Hazard Intensity (MHI)** index — a pixel-level composite score (0–10) capturing the combined intensity of climate hazards across all land areas. This is Stage 1 of the pipeline.

The **Multi-Hazard Category (MHC)** — a count of how many hazard types affect a location — is computed downstream in `script/data_prep/hazard_exposure_new.ipynb` as part of the country-level exposure step.

---

## Scripts

### `MHI_input_gee.js`
GEE JavaScript script that exports all hazard rasters needed for MHI construction.

- Exports 13 hazard rasters + a land-sea mask as GeoTIFFs at ~0.1° resolution (ERA5 native scale)
- Output folder: `ccri_pixel` on Google Drive → moved to `data/misc/ccri_pixel/`
- Reference projection: `projects/unicef-ccri/assets/ERA5_100yr_RP`

**Excluded from MHI:** air pollution (PM2.5) and malaria (Pf, Pv) — these are health-based indicators unsuitable for the intensity PCA.

---

### `mhi_construction.ipynb`
Builds the MHI raster from the exported TIFs using PCA-based aggregation.

**Inputs:** `data/misc/ccri_pixel/*.tif` (13 hazard TIFs + `landSeaMask.tif`)

**Steps:**
1. Load each hazard raster; mask ocean pixels using `landSeaMask.tif`
2. Extract land pixels only; fill NaN → 0 (no-data treated as zero exposure)
3. Apply log-transform (`log1+x`) then z-score normalization — fitted on land pixels only
4. Stack all layers; run PCA; compute variance-weighted loading vector from top 6 components (~85–95% of variance)
5. Project land pixels onto loading vector; MinMax scale to 0–10
6. Write output raster (land pixels = 0–10 score, ocean = NaN)

**Output:** `data/CCRI_results_misc/MHI_climate.tif`

After generation, the raster is manually uploaded to GEE as:
`projects/unicef-ccri/assets/hazards/MHI_climate`

---

## Hazard layers used in MHI

| File | Hazard |
|---|---|
| `river_flood_100yr_jrc_2024.tif` | River flood |
| `coastal_flood_100yr_jrc_2024.tif` | Coastal flood |
| `tropical_storm_100yr_giri_2024.tif` | Tropical storm |
| `agricultural_drought_fao_1984-2023.tif` | Agricultural drought |
| `drought_spei_terraclimate_1958-2025.tif` | Meteorological drought (SPEI) |
| `drought_spi_terraclimate_1958-2025.tif` | Meteorological drought (SPI) |
| `heatwave_frequency_ecmwf_2014-2024.tif` | Heatwave frequency |
| `heatwave_duration_ecmwf_2014-2024.tif` | Heatwave duration |
| `heatwave_severity_ecmwf_2014-2024.tif` | Heatwave severity |
| `extreme_heat_ecmwf_2014-2024.tif` | Extreme heat degree-days |
| `fire_FRP_nasa_2001-2024.tif` | Fire radiative power |
| `fire_frequency_nasa_2001-2023.tif` | Fire frequency |
| `sand_dust_storm_unccd_2024.tif` | Sand and dust storm |
