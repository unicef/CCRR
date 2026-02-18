# 🌍 Children’s Climate Risk Report (CCRR) Repository

This repository contains the data and scripts for constructing the **Children’s Climate Risk Report**, including hazard exposure, child vulnerability, and multi-hazard aggregation.

---

## 📂 Folder Structure

### 1. `script/data_processing`
Core scripts for processing the two main pillars:

- `pillar1_processing.ipynb` – Processes climate hazard exposure data (Pillar 1).  
- `pillar2_processing.ipynb` – Processes child vulnerability indicators (Pillar 2).  
- `p1_p2_aggregation.ipynb` – Aggregates processed data from P1 and P2 into final CCRR layers.  
- `ccri_formatting.ipynb` – Standardizes and formats output for index layers.

### 2. `data/pillar1_data`
Contains country-level hazard exposure data for children across multiple climate hazards.

### 3. `data/pillar2_data`
Contains indicators of child vulnerability used for Pillar 2 of the CCRR index.

### 4. `script/multi_hazard`
Scripts for Multi-Hazard Intensity (MHI) index construction:

- Combines multiple hazards into a single metric using Earth Engine and statistical aggregation.

### 5. `data/misc`
Auxiliary datasets for country grouping and contextual data:

- Country groupings (UNICEF Program Region, World Bank Income)  
- List of fragile contexts  

---

## 📈 Methodology

1. **Data Preparation**  
   - Systematic ingestion, cleaning, and normalization of hazard and vulnerability datasets.
   - Handled via `vulnerability_data_download.ipynb`.

2. **Pillar Processing**  
   - Pillar 1: Hazard exposure aggregation by country.  
   - Pillar 2: Child vulnerability indicators normalized and standardized.  
   - Aggregation of P1 and P2 is performed in `p1_p2_aggregation.ipynb`.

3. **Multi-Hazard Index (MHI)**  
   - Spatial and statistical combination of multiple hazard layers.  
   - Outputs a single hazard intensity score per location.

4. **CCRR Index Construction**  
   - Combines Pillar 1, Pillar 2, and MHI layers into the final CCRR index.  
   - Provides country-level and spatial risk scores for children.

---

## 📜 Citation

UNICEF (2026). *Children’s Climate Risk Report (CCRR): Children’s Climate Risk Report Data Pipeline [Computer software]. GitHub. https://github.com/unicef/CCRR*

---

## ✉️ Contact

**Dohyung Kim**  
Data Science Specialist  
UNICEF Climate & Environment Data Unit  
Email: dokim@unicef.org
