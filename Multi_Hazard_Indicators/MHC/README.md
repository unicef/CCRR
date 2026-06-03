# Multi-Hazard Count (MHC)

The **Multi-Hazard Count (MHC)** measures how many distinct hazard categories a pixel or country is exposed to, ranging from 0 to 8.

---

## Methodology

MHC is computed in GCHD as part of Stage 2 (country-level exposure). For each pixel, the binary hazard layers (one per category) are summed. Countries with children exposed to ≥1, ≥2, … ≥8 hazard categories are reported separately.

**[GCHD Repository — MHC methodology](https://github.com/unicef/GCHD)**

The 8 hazard categories counted in MHC:
1. Flood (river + coastal)
2. Tropical storm
3. Drought (agricultural + meteorological)
4. Heatwave / extreme heat
5. Wildfire
6. Air pollution
7. Sand & dust storm
8. Malaria

---

## CCRR usage

MHC exposure columns in the final CCRR output (`misc/CCRI_P1_P2_format.geojson`) are named:

`mhc_ge1_abs`, `mhc_ge1_rel`, `mhc_ge2_abs`, … `mhc_ge8_abs`, `mhc_ge8_rel`

These are produced by the country exposure notebook in [Country_level_hazard_exposure/hazard_exposure_new.ipynb](../../Country_level_hazard_exposure/hazard_exposure_new.ipynb) and pass through the CCRR pipeline unchanged (no normalization applied).
