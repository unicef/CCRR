# Hazard Data Preparation

**Stage 0 of the CCRR pipeline.**

The raw hazard datasets used in CCRR are sourced, processed, and uploaded to Google Earth Engine (GEE) as part of the **Global Child Hazard Database (GCHD)** — a separate UNICEF repository. This folder links to those scripts and documents which GCHD assets feed into CCRR.

---

## GCHD Repository

**[github.com/unicef/GCHD](https://github.com/unicef/GCHD)**

All hazard preparation scripts live in GCHD. The table below maps each hazard to its GCHD notebook and the GEE asset produced.

| Hazard | GCHD Notebook | Source Dataset |
|---|---|---|
| Agricultural Drought | [`ASI_RP.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/ASI_RP.ipynb) | FAO ASIS return level |
| Wildfire | [`Fire_90th_percentile.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/Fire_90th_percentile.ipynb) | NASA FIRMS |
| River & Coastal Flood | [`flood_download.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/flood_download.ipynb) | JRC 100-year return |
| Heatwave & Extreme Heat | [`heatwave_RP.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/heatwave_RP.ipynb) | ERA5/ECMWF |
| Malaria | [`malaria_average.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/malaria_average.ipynb) | MAP Pf & Pv |
| Air Pollution (PM2.5) | [`PM25_90th_percentile.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/PM25_90th_percentile.ipynb) | Satellite PM2.5 |
| Meteorological Drought | [`compute_SPI_SPEI.ipynb`](https://github.com/unicef/GCHD/blob/main/script/data_prep/compute_SPI_SPEI.ipynb) | TerraClimate SPI-12 & SPEI-12 |
| Tropical Storm | from GCHD assets | GIRI 100-year return |
| Sand & Dust Storm | from GCHD assets | UNCCD |

---

## What gets produced

Each notebook downloads a raw global dataset, applies the agreed threshold methodology (e.g. 100-year return period, 90th percentile), and uploads the result as a GEE raster asset under `projects/unicef-ccri/assets/hazards/`.

These GEE assets are then used in:
- [Multi_Hazard_Indicators/MHI/](../Multi_Hazard_Indicators/MHI/) — MHI pixel raster construction
- [Country_level_hazard_exposure/](../Country_level_hazard_exposure/) — country-level population exposure computation

---

## Run when

Re-run GCHD Stage 0 notebooks when:
- The underlying hazard source dataset releases a new version
- The threshold definition or methodology changes
- The temporal coverage needs extending

After re-running, regenerate MHI (Stage 1) and country exposure (Stage 2) before re-running the CCRR pipeline.
