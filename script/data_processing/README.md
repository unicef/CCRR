# Index Construction & Statistical Methodology

### Hazard Exposure Calculation
Child exposure estimates were computed within a **Google Earth Engine** framework by spatially intersecting high-resolution demographic rasters (**WorldPop**, <18 years) with a suite of climate hazard layers. The analysis followed a three-stage protocol:

* **Binary Masking**: Continuous hazard datasets (e.g., flood depth, drought indices, heatwave duration) were converted into binary exposure masks based on defined intensity thresholds.
* **Thematic Aggregation**: Individual hazard masks were consolidated into thematic composites (e.g., Heatwave, Drought) and a cumulative **multi-hazard coincidence layer**, representing the spatial overlap of up to 16 distinct stressors.
* **Zonal Statistics**: Total exposed child populations were quantified via zonal summation across administrative boundaries, effectively stratifying risk by individual hazard, thematic category, and multi-hazard intensity.

**Script**: `pop_exposure.ipynb`

---

### Exposure Normalization & Scoring
To ensure comparability across disparate hazard types and demographic scales, raw exposure data were transformed into normalized risk indices (scale 1–10) using a dual-metric approach:

* **Absolute Exposure Index**: Raw exposed population counts underwent **logarithmic transformation ($log_{10}$)** to mitigate skewness inherent in demographic distributions. The transformed values were clipped to pre-calculated global thresholds (derived from the distribution’s tail ends) and normalized to a 1–10 scale using Min-Max scaling.
* **Relative Exposure Index**: This metric quantifies the proportion of the child population exposed ($Exposed / Total$). The resulting percentages were similarly clipped to robust min-max thresholds to handle outliers before being scaled to the standard 1–10 range.
* **Consistency Validation**: A logic check ensured alignment between metrics; if an administrative unit registered zero absolute exposure, its relative exposure score was forcibly set to zero to prevent statistical artifacts.

**Script**: `pillar1_processing.ipynb`

---

### Vulnerability Index Construction
The construction of the vulnerability index follows a four-stage statistical protocol:

* **Iterative Outlier Suppression**: To mitigate the influence of extreme values in socio-economic data, an **iterative trimming algorithm** is applied. This process recursively removes minimum and maximum values until the dataset achieves a skewness $\le$ 2 and kurtosis $\le$ 3.5, ensuring that the final distribution is statistically stable without compromising data integrity.
* **Directional Normalization**: Indicators are normalized to a standardized 0–10 scale using Min-Max scaling. For "positive" indicators where higher values imply *lower* vulnerability (e.g., *Skilled birth coverage*, *School completion rate*), a **reverse normalization** ($10 - Value_{norm}$) is applied to align all metrics so that higher scores consistently represent **higher vulnerability**.
* **Domain-Specific Aggregation**: Normalized indicators are grouped into seven core domains: **Health, Nutrition, WASH, Education, Child Protection, Poverty, and Survival**. A domain score is calculated as the arithmetic mean of its constituent indicators, ensuring that each thematic area contributes equally to the final profile.
* **Composite Vulnerability Scoring**: The final Pillar 2 score is derived from the arithmetic mean of the seven domain scores. This hierarchical aggregation prevents indicators in data-rich domains from overpowering those in data-sparse domains, providing a balanced assessment of multi-dimensional child vulnerability.

**Script**: `pillar2_processing.ipynb`

---

### Composite Index Construction & Geospatial Integration
The final Children's Climate Risk Index (CCRI) was derived through a multi-stage geometric aggregation protocol, designed to limit substitutability between Exposure (Pillar 1) and Vulnerability (Pillar 2).

* **Pillar 1 Aggregation (Exposure)**:
    * **Hazard Grouping**: Individual hazard indicators were organized into thematic groups (e.g., *Heatwave* comprises frequency, duration, and severity).
    * **Geometric Mean Calculation**: To balance the influence of absolute (population count) and relative (population share) metrics, the **geometric mean** was computed for each hazard pair. Subsequently, a second-order geometric mean aggregated these hazard-specific scores into a unified **Pillar 1 Exposure Index**, which was Min-Max scaled to a standardized 0–10 range.

* **Composite Risk Calculation**:
    * The final CCRI score was calculated as the **geometric mean** of the aggregated Pillar 1 (Exposure) and Pillar 2 (Vulnerability) indices. This multiplicative approach ensures that high risk in one dimension cannot be fully compensated by low risk in the other, effectively highlighting "hotspots" where high exposure coincides with critical vulnerability.
    * *Note*: A negligible epsilon constant was introduced during computation to ensure mathematical stability in the presence of zero values.

**Script**: `p1_p2_aggregation.ipynb`

---

### Final Data Integration & Formatting Protocol
This protocol systematically merges processed Exposure (Pillar 1), Vulnerability (Pillar 2), and auxiliary metadata (World Bank income, fragility status) into a single master dataset.

* **Standardization**: Implements a comprehensive **nomenclature harmonization strategy**, renaming verbose variables to standardized alphanumeric codes for schema consistency.
* **Constraint Enforcement**: Applies logical validation rules to **cap absolute exposure values** at the total under-18 population limit, correcting for potential raster aggregation artifacts.
* **Output Generation**: Exports a topologically valid, fully attributed **GeoJSON** optimized for dashboard deployment and strategic analysis.

**Script**: `ccri_formatting.ipynb`