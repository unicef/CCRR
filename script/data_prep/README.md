# CCRR Climate Hazard Data: Acquisition and Processing

This repository contains scripts and protocols for the systematic ingestion, processing, and statistical modeling of various climate-related hazards.

---

## 1. Pre-calculated Hazard Layers
The following datasets are utilized in their pre-calculated format, representing specific return periods or intensity metrics:

* **Riverine and Coastal Flood**: Return period-based hazard layers.
* **Wind Speed**: Return period-based peak gust velocity.
* **Sand and Dust Storms**: Intensity-based hazard layers.

---

## 2. Modeled Hazard Indicators

### Agricultural Stress Index (ASI)
* **Metric**: Return Period
* **Methodology**: Automated ingestion of FAO ASI raster assets, which are then integrated into a multi-decadal time-series stack. Extreme Value Theory (EVT) is applied via a **Gumbel distribution** to translate long-term observations into pixel-wise return levels.
* **Script**: `ASI_RP.ipynb`



### Heatwave Indicators
* **Metric**: Return Period (10–100 years)
* **Methodology**: Multi-year indicators (duration, frequency, severity, and extreme heat days) are consolidated into virtual time-series stacks. Pixel-wise observations are ranked and converted into empirical exceedance probabilities using the **Weibull plotting position**. Computation is executed via parallelized tile-based processing and masked to terrestrial areas.
* **Script**: `heatwave_RP.ipynb`

### Fire Dynamics (Intensity and Frequency)
* **Metric**: 90th Percentile
* **Methodology**: Multi-year MODIS fire indicators are aggregated into temporal stacks. The **90th percentile** is computed per pixel (filtering for non-positive values) to identify spatial patterns of historically anomalous fire activity.
* **Script**: `fire_90th_percentile.ipynb`

### PM2.5 Air Pollution
* **Metric**: 90th Percentile
* **Methodology**: Annual PM2.5 concentration fields (NetCDF) are converted to georeferenced GeoTIFFs and organized into a multi-year raster cube. A pixel-wise 90th percentile analysis over the most recent decadal period identifies regions of persistent high-intensity atmospheric pollution.
* **Script**: `PM25_90th_percentile.ipynb`

### Malaria Burden (Pf and Pv)
* **Metric**: Decadal Average
* **Methodology**: Multi-year prevalence rasters for *Plasmodium falciparum* (Pf) and *Plasmodium vivax* (Pv) are stacked and averaged to establish baseline spatial patterns of recent malaria burden.
* **Script**: `malaria_average.ipynb`

### Drought Indices (SPI and SPEI)
* **Metric**: Temporal Mean
* **Methodology**: Multi-decadal datasets (1940–2025) are retrieved from **ECMWF/ERA5 reanalysis**. Parameters include a 12-month accumulation period for consolidated drought variables. Pixel-wise temporal statistics are computed to represent historical drought extremes and mean conditions.
* **Script**: `SPI_SPEI_average.ipynb`


## 3. Vulnerability Data Acquisition (Pillar 2)
* **Metric**: Latest Available Observation
* **Methodology**: Socio-economic indicators (Health, WASH, Education, Social Protection) are harvested directly from the **UNICEF SDMX Data Warehouse**. The pipeline iterates through global ISO3 codes to query 16 key child-centric datasets via RESTful API endpoints. XML responses are parsed to programmatically identify and extract only the most recent valid observation for each country, which is then serialized into CSV format for normalization.
* **Script**: `vulnerability_data_download.ipynb`
