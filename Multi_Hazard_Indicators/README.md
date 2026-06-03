# Multi-Hazard Indicators

This folder contains the scripts and data for constructing two composite multi-hazard indicators that sit above individual hazard layers:

| Subfolder | Indicator | Description |
|---|---|---|
| [MHI/](MHI/) | Multi-Hazard Intensity | Continuous 0–10 pixel-level score combining 13 hazard layers via PCA |
| [MHC/](MHC/) | Multi-Hazard Count | Number of distinct hazard categories a location is exposed to (0–8) |
| [Hazard_combination/](Hazard_combination/) | Hazard Combination Analysis | Country-level analysis of co-occurring hazard combinations |

---

## MHI vs MHC

**MHC** answers: *How many different types of hazards does a location face?*
It counts distinct hazard categories (max 8), identifying hotspots where children face simultaneous hazard types.

**MHI** answers: *How intense is the combined hazard burden?*
It uses a PCA-based synthetic approach across 13 hazard layers (excluding air pollution and malaria) to produce a continuous 0–10 score that distinguishes frequent mild events from rare catastrophic ones.

Both indicators are computed at pixel level (~0.1° resolution), then aggregated to country level in [Stage 2](../Country_level_hazard_exposure/).
