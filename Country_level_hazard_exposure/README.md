# Country-Level Hazard Exposure

**Stage 2 of the CCRR pipeline.**

Computes population-weighted children's exposure to each hazard at the country level, using Google Earth Engine (GEE) `reduceRegions` over child population rasters.

---

## Contents

| File | Description |
|---|---|
| `hazard_exposure_new.ipynb` | Main Stage 2 notebook — runs in GEE Python API |
| `Hazard_Population_Exposure.csv` | **Primary output** — main pipeline input for CCRR_Pipeline |

> Auxiliary files (`Hazard_Population_Exposure_adm2.csv`, `*tileScale4.csv`, `ARM/`, `adm2_hazard_exposure_updated.ipynb`, `raster_stats.ipynb`) are gitignored — for subnational analysis only.

---

## What the notebook computes

For each of 229 countries (195 states + 34 territories), `hazard_exposure_new.ipynb` produces:

| Metric | Coverage |
|---|---|
| Individual hazard binary exposure | 17 hazards × absolute count + relative % |
| Multi-Hazard Count (MHC) | Children exposed to ≥1 … ≥8 hazard categories |
| Multi-Hazard Intensity (MHI) | Children above global p75/p80/p85/p90/p95 thresholds |
| Total and child (U18) population | Per country |

**GEE assets used:**
- 17 binary hazard layers (from GCHD)
- `MHI_climate` raster (from [Multi_Hazard_Indicators/MHI/](../Multi_Hazard_Indicators/MHI/))
- Child population: `worldpop_T_U18_2025_CN_100m`
- Boundaries: `adm0_chunked_500km_shp`

---

## Run when

Re-run when:
- Any hazard raster asset is updated in GEE
- The MHI raster is regenerated
- The WorldPop population baseline changes
- Country boundaries are updated

The output CSV is the primary input to [CCRR_Pipeline/ccrr_pipeline.py](../CCRR_Pipeline/ccrr_pipeline.py).
