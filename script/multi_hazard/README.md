# Multi-Hazard Index

### Multi-Hazard Intensity (MHI) Index Construction
* **Metric**: Variance-Weighted Intensity Score (Scale 0–10)
* **Methodology**: This module generates a pixel-level composite index of climate hazard intensity using a data-driven dimensionality reduction approach.
    * **Preprocessing**: Raw hazard rasters undergo **logarithmic stabilization** ($\log(1+x)$) to mitigate skewness, followed by **Z-score standardization** to ensure unit comparability across diverse physical variables (e.g., flood depth vs. heatwave duration).
    * **Dimensionality Reduction**: A **Principal Component Analysis (PCA)** is applied to the stacked raster assembly to extract the dominant modes of variance.
    * **Variance-Weighted Aggregation**: The final intensity score is computed by projecting the original hazard layers onto a weighted vector derived from the top Principal Components (explaining ~85-95% of variance). This ensures that the most statistically significant hazard drivers contribute proportionally to the final index.
    * **Normalization**: The resulting composite scores are Min-Max scaled to a standardized 0–10 range and exported as a high-resolution GeoTIFF.
* **Script**: `mhi_construction.ipynb`



---

### Multi-Hazard Coincidence (MHC) Analysis
* **Metric**: Cumulative Thematic Hazard Count (Range: 0–8)
* **Methodology**: To quantify the spatial overlap of disparate climate stressors without artificially inflating risk via correlated indicators (e.g., *Heatwave Frequency* vs. *Duration*), the script implements a two-stage aggregation logic:
    1. **Thematic Aggregation**: Individual hazard layers are first grouped into 8 distinct **Thematic Domains** (e.g., *Drought, Heatwave, Flood*). Within each domain, a **spatial union** is applied—if a pixel exceeds the threshold for *any* sub-indicator (e.g., frequency or severity), the entire domain is flagged as active.
    2. **Spatial Coincidence Counting**: The binary masks of these 8 thematic domains are stacked and summed pixel-wise. The resulting integer raster represents the number of concurrent hazard types affecting a specific location.
* **Script**: `mhc_construction.js`