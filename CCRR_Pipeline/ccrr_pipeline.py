"""
CCRI Pipeline
Runs in order: pillar1 -> pillar2 -> p1_p2_aggregation -> quadrant -> ccri_formatting
Run from the repo root:  python CCRR_Pipeline/ccrr_pipeline.py
"""

import os
import glob
import warnings

import numpy as np
import pandas as pd
import geopandas as gpd
import yaml
from scipy.stats import gmean, skew, kurtosis
from sklearn.preprocessing import MinMaxScaler

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'config.yaml')

with open(CONFIG_PATH) as f:
    cfg = yaml.safe_load(f)

def p(rel):
    """Resolve a repo-relative path."""
    return os.path.join(REPO_ROOT, rel)


# ── Shared helpers ────────────────────────────────────────────────────────────

def trim_outliers_iteratively(values, max_skew=2, max_kurtosis=3.5):
    values = values.dropna().values
    while True:
        if abs(skew(values)) <= max_skew and kurtosis(values) <= max_kurtosis:
            break
        mn, mx = values.min(), values.max()
        values = values[(values > mn) & (values < mx)]
    return values, values.min(), values.max()


def boxplot_outlier_detection(values):
    Q1, Q3 = np.percentile(values, 25), np.percentile(values, 75)
    IQR = Q3 - Q1
    lo, hi = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
    return values[(values >= lo) & (values <= hi)], lo, hi


# ── Step 1: Pillar 1 processing ───────────────────────────────────────────────

def run_pillar1():
    print("[1/5] Pillar 1 processing started...")
    p1_cfg = cfg['pillar1']
    norm_range = tuple(p1_cfg['normalization_range'])
    log_thresh = p1_cfg['absolute_log_threshold']
    log_floor  = p1_cfg['absolute_log_floor']
    zero_fill  = set(p1_cfg['zero_fill_cols'])

    exclude_iso3 = set() if cfg['options']['include_sids'] else set(cfg['sids_iso3'])
    if exclude_iso3:
        print(f"  SIDS excluded ({len(exclude_iso3)} countries)")

    adm0_df = gpd.read_file(p(cfg['paths']['adm0_geojson']))
    ucode_iso3 = adm0_df[['ucode', 'ISO3']].rename(columns={'ISO3': 'iso3'}).copy()
    if exclude_iso3:
        ucode_iso3 = ucode_iso3[~ucode_iso3['iso3'].isin(exclude_iso3)]

    merged_exposure_df = ucode_iso3[['iso3']].drop_duplicates(subset=['iso3'], keep='first').copy()

    df_osig = pd.read_csv(p(cfg['paths']['hazard_exposure_csv']))
    df_osig = df_osig.merge(ucode_iso3, on='ucode', how='inner')
    df_osig = df_osig.groupby('iso3').sum(numeric_only=True, min_count=1).reset_index()

    df_min_max = pd.read_csv(p(cfg['paths']['p1_min_max_csv']))
    exposure_cols = [c for c in df_osig.columns if c.startswith('pop_exposed_')]

    for col in exposure_cols:
        clean_name  = col.replace('pop_exposed_', '')
        hazard_name = '_'.join(clean_name.split('_')[:2])

        abs_rows = df_min_max.loc[(df_min_max['filename'] == hazard_name) & (df_min_max['type'] == 'abs')]
        rel_rows = df_min_max.loc[(df_min_max['filename'] == hazard_name) & (df_min_max['type'] == 'rel')]
        if abs_rows.empty or rel_rows.empty:
            continue

        df = df_osig[['iso3', col, 'pop_child_total']].copy()
        df = df.rename(columns={col: 'child_population_exposed', 'pop_child_total': 'child_population_total'})
        if col in zero_fill:
            df['child_population_exposed'] = df['child_population_exposed'].fillna(0)

        # Absolute exposure
        df['absolute_exposure'] = np.where(
            df['child_population_exposed'].isna(), np.nan,
            np.where(df['child_population_exposed'] > log_thresh,
                     np.log10(df['child_population_exposed'].clip(lower=1)),
                     log_floor)
        )
        mn, mx = abs_rows['min'].values[0], abs_rows['max'].values[0]
        valid = df['absolute_exposure'].notna()
        df.loc[valid, 'absolute_exposure'] = np.clip(df.loc[valid, 'absolute_exposure'], mn, mx)
        scaler = MinMaxScaler(feature_range=norm_range)
        df.loc[valid, 'absolute_value_normalized'] = scaler.fit_transform(
            df.loc[valid, ['absolute_exposure']]).flatten()

        # Relative exposure
        df['relative_exposure'] = np.where(
            df['child_population_exposed'].isna(), np.nan,
            np.where(df['child_population_total'] > 0,
                     (df['child_population_exposed'] / df['child_population_total']) * 100,
                     0)
        )
        mn, mx = rel_rows['min'].values[0], rel_rows['max'].values[0]
        valid = df['relative_exposure'].notna()
        df.loc[valid, 'relative_exposure'] = np.clip(df.loc[valid, 'relative_exposure'], mn, mx)
        scaler = MinMaxScaler(feature_range=norm_range)
        df.loc[valid, 'relative_value_normalized'] = scaler.fit_transform(
            df.loc[valid, ['relative_exposure']]).flatten()

        df = df.rename(columns={
            'absolute_value_normalized': hazard_name + '_absolute',
            'relative_value_normalized': hazard_name + '_relative',
        })
        merged_exposure_df = merged_exposure_df.merge(
            df[['iso3', hazard_name + '_absolute', hazard_name + '_relative']],
            on='iso3', how='left')

    # Manual null overrides from config
    for iso3, cols in p1_cfg.get('force_null', {}).items():
        mask = merged_exposure_df['iso3'] == iso3
        for col in cols:
            if col in merged_exposure_df.columns:
                merged_exposure_df.loc[mask, col] = np.nan

    merged_exposure_df.to_csv(p(cfg['paths']['merged_exposure_csv']), index=False)
    print(f"  -> {cfg['paths']['merged_exposure_csv']}")


# ── Step 2: Pillar 2 processing ───────────────────────────────────────────────

def run_pillar2():
    print("[2/5] Pillar 2 processing started...")
    p2_cfg      = cfg['pillar2']
    norm_range  = tuple(p2_cfg['normalization_range'])
    time_min    = p2_cfg['time_period_min']
    threshold   = p2_cfg['coverage_threshold']
    reverse_set = set(p2_cfg['reverse_columns'])
    domains     = p2_cfg['domains']
    exclude_iso3 = set() if cfg['options']['include_sids'] else set(cfg['sids_iso3'])

    dest_folder = p(cfg['paths']['merged_exposure_csv']).rsplit('/', 1)[0]  # misc/
    csv_files   = glob.glob(os.path.join(p(cfg['paths']['pillar2_data_dir']), '*.csv'))
    df_min_max  = pd.read_csv(p(cfg['paths']['p2_min_max_csv']))
    df_min_max['filename'] = df_min_max['filename'].astype(str).str.strip()

    base_iso3 = pd.read_csv(
        os.path.join(p(cfg['paths']['pillar2_data_dir']), 'P2_Under_five_mortality.csv'),
        usecols=['iso3'])
    if exclude_iso3:
        base_iso3 = base_iso3[~base_iso3['iso3'].isin(exclude_iso3)]
    merged_df = base_iso3.copy()

    for file in csv_files:
        df = pd.read_csv(file)
        if 'time_period' in df.columns:
            df = df[df['time_period'] >= time_min]
        filename = os.path.basename(file).replace('.csv', '').strip()
        if 'iso3' not in df.columns or 'obs_value' not in df.columns:
            continue
        df = df[['iso3', 'obs_value']].dropna()

        rows = df_min_max.loc[df_min_max['filename'] == filename]
        if rows.empty:
            continue

        mn, mx = rows['min'].values[0], rows['max'].values[0]
        df['obs_value'] = np.clip(df['obs_value'], mn, mx)

        scaler = MinMaxScaler(feature_range=norm_range)
        df['value_normalized'] = scaler.fit_transform(df[['obs_value']]).flatten()

        if filename in reverse_set:
            df['value_normalized'] = norm_range[1] - df['value_normalized']

        df = df.rename(columns={'value_normalized': filename + '_value_normalized'})
        merged_df = merged_df.merge(df[['iso3', filename + '_value_normalized']],
                                    on='iso3', how='left')

    pillar2_columns = [c for c in merged_df.columns if c.endswith('_value_normalized')]

    # Drop countries below coverage threshold
    merged_df = merged_df[
        (merged_df[pillar2_columns].notna().sum(axis=1) / len(pillar2_columns)) >= threshold
    ]

    # Domain averages
    domains_data = {}
    for domain, prefixes in domains.items():
        domain_cols = [c for c in merged_df.columns
                       if any(c.startswith(px) for px in prefixes) and c.endswith('_value_normalized')]
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)
            domains_data[domain] = merged_df[domain_cols].apply(np.nanmean, axis=1)

    domains_df = pd.DataFrame(domains_data)
    merged_df = merged_df.copy()
    merged_df['P2_arithmetic_avg'] = domains_df.apply(np.nanmean, axis=1)
    merged_df['rank_reverse'] = merged_df['P2_arithmetic_avg'].rank(method='average', ascending=False)

    merged_df.to_csv(p(cfg['paths']['p2_merged_csv']), index=False)
    print(f"  -> {cfg['paths']['p2_merged_csv']}")

    p2_group_mean = pd.concat([merged_df[['iso3']], domains_df], axis=1)
    p2_group_mean.to_csv(p(cfg['paths']['p2_group_mean_csv']), index=False)
    print(f"  -> {cfg['paths']['p2_group_mean_csv']}")


# ── Step 3: P1 + P2 aggregation ──────────────────────────────────────────────

def run_aggregation():
    print("[3/5] P1 + P2 aggregation started...")
    p1_cfg       = cfg['pillar1']
    hazard_groups = p1_cfg['hazard_groups']
    p1_score_range = tuple(p1_cfg['p1_score_range'])

    df_P1 = pd.read_csv(p(cfg['paths']['merged_exposure_csv']))
    df_P2 = pd.read_csv(p(cfg['paths']['p2_merged_csv']))

    # Group geometric means
    group_mean_columns = []
    for group, hazards in hazard_groups.items():
        group_means = []
        for hazard in hazards:
            abs_col = f'{hazard}_absolute'
            rel_col = f'{hazard}_relative'
            mean_col = f'{hazard}_mean'
            df_P1[mean_col] = df_P1[[abs_col, rel_col]].apply(
                lambda row: gmean(row.replace(0, np.nan).dropna())
                if len(row.replace(0, np.nan).dropna()) > 0 else np.nan,
                axis=1)
            group_means.append(mean_col)

        # All hazards in the group must be present; if any is NaN the group is NaN
        group_col = f'{group}_gmean'
        df_P1[group_col] = df_P1[group_means].apply(
            lambda row: gmean(row) if not row.isnull().any() else np.nan,
            axis=1)
        group_mean_columns.append(group_col)

    # P1 overall geometric mean — null if ANY group is null
    df_P1['P1_geometric_avg'] = df_P1[group_mean_columns].apply(
        lambda row: gmean(row) if not row.isnull().any() else np.nan, axis=1)

    # Save group means
    p1_group_mean = df_P1[['iso3'] + group_mean_columns].copy()
    p1_group_mean.to_csv(p(cfg['paths']['p1_group_mean_csv']), index=False)
    print(f"  -> {cfg['paths']['p1_group_mean_csv']}")

    # Scale P1 to final range
    scaler = MinMaxScaler(feature_range=p1_score_range)
    df_P1['P1_geometric_avg'] = scaler.fit_transform(df_P1[['P1_geometric_avg']]).flatten()

    df_P1_grouped = df_P1.groupby('iso3', as_index=False)['P1_geometric_avg'].mean()

    # Merge P1 + P2
    merged_df = df_P1_grouped.merge(df_P2[['iso3', 'P2_arithmetic_avg']], on='iso3', how='left')
    merged_df['P1_P2_geometric_avg'] = merged_df.apply(
        lambda row: gmean([row['P1_geometric_avg'] + 1e-10, row['P2_arithmetic_avg'] + 1e-10])
        if not (np.isnan(row['P1_geometric_avg']) or np.isnan(row['P2_arithmetic_avg'])) else np.nan,
        axis=1)
    merged_df['rank_reverse'] = merged_df['P1_P2_geometric_avg'].rank(method='average', ascending=False)

    merged_df.to_csv(p(cfg['paths']['p1_p2_avg_csv']), index=False)
    print(f"  -> {cfg['paths']['p1_p2_avg_csv']}")

    # Build GeoJSON
    geo_df = gpd.read_file(p(cfg['paths']['georepo_gpkg']))[['ISO3', 'uuid', 'name', 'geometry']]

    exposure_df = pd.read_csv(p(cfg['paths']['hazard_exposure_csv']))
    exposure_df['iso3'] = exposure_df['ucode'].str.extract(r'^([A-Za-z]+)\d*_V')
    exposure_df = exposure_df.rename(columns={'pop_child_total': 'child_population_total'})
    exposure_df = exposure_df.groupby('iso3', as_index=False)[['child_population_total']].sum()

    geo_df = geo_df.merge(exposure_df[['iso3', 'child_population_total']],
                          left_on='ISO3', right_on='iso3', how='left')
    geo_df = geo_df.drop(columns=['iso3'])

    merged_geo_df = geo_df.merge(merged_df, left_on='ISO3', right_on='iso3', how='left')

    if 'name' in df_P1.columns:
        df_P1 = df_P1.drop(columns=['name'])
    numeric_cols = df_P1.select_dtypes(include=[np.number]).columns
    df_P1 = df_P1.groupby('iso3', as_index=False)[numeric_cols].mean()

    merged_geo_df = merged_geo_df.merge(df_P1, left_on='ISO3', right_on='iso3', how='left')
    merged_geo_df = merged_geo_df.merge(df_P2, left_on='ISO3', right_on='iso3', how='left')
    merged_geo_df = merged_geo_df.drop(columns=['iso3'], errors='ignore')

    merged_geo_df.to_file(p(cfg['paths']['p1_p2_avg_geojson']), driver='GeoJSON')
    print(f"  -> {cfg['paths']['p1_p2_avg_geojson']}")


# ── Step 4: Quadrant classification ──────────────────────────────────────────

def run_quadrant():
    print("[4/5] Quadrant classification started...")
    ccri_values = pd.read_csv(p(cfg['paths']['p1_p2_avg_csv']))
    ccri_values['iso3'] = ccri_values['iso3'].astype(str).str.strip()

    ccri_df = ccri_values[['iso3', 'P1_geometric_avg', 'P2_arithmetic_avg']].copy()
    ccri_df = ccri_df.rename(columns={'iso3': 'ISO3', 'P1_geometric_avg': 'P1', 'P2_arithmetic_avg': 'P2'})
    ccri_df['P1'] = pd.to_numeric(ccri_df['P1'], errors='coerce')
    ccri_df['P2'] = pd.to_numeric(ccri_df['P2'], errors='coerce')
    ccri_df = ccri_df.dropna(subset=['P1', 'P2']).reset_index(drop=True)

    x_thr = ccri_df['P1'].median()
    y_thr = ccri_df['P2'].median()

    def quadrant_class(x, y):
        if x >= x_thr and y >= y_thr:   return 'High P1, High P2'
        elif x >= x_thr and y < y_thr:  return 'High P1, Low P2'
        elif x < x_thr and y >= y_thr:  return 'Low P1, High P2'
        else:                            return 'Low P1, Low P2'

    ccri_df['Quadrant'] = ccri_df.apply(lambda r: quadrant_class(r['P1'], r['P2']), axis=1)
    ccri_df.to_csv(p(cfg['paths']['quadrant_csv']), index=False)
    print(f"  -> {cfg['paths']['quadrant_csv']}")


# ── Step 5: CCRI formatting ───────────────────────────────────────────────────

def run_formatting():
    print("[5/5] CCRI formatting started...")
    fmt_cfg = cfg['formatting']
    exclude_iso3 = set(fmt_cfg['exclude_iso3'])

    # Load inputs
    p1_exposure_file = pd.read_csv(p(cfg['paths']['merged_exposure_csv']))
    cols_to_rescale = p1_exposure_file.select_dtypes(include='number').columns
    p1_exposure_file[cols_to_rescale] = p1_exposure_file[cols_to_rescale].apply(
        lambda col: 10 * (col - col.min()) / (col.max() - col.min()))

    p2_exposure_file = pd.read_csv(p(cfg['paths']['p2_merged_csv']))
    p1p2_scores      = pd.read_csv(p(cfg['paths']['p1_p2_avg_csv']))
    wb_income        = pd.read_csv(p(cfg['paths']['wb_income_csv']))
    unicef_ro        = pd.read_csv(p(cfg['paths']['unicef_ro_csv']))
    adm0             = gpd.read_file(p(cfg['paths']['adm0_simple_geojson']))
    fragile          = pd.read_csv(p(cfg['paths']['fragile_csv']))

    p1_components = pd.read_csv(p(cfg['paths']['p1_group_mean_csv']))
    cols_to_rescale = p1_components.select_dtypes(include='number').columns
    p1_components[cols_to_rescale] = p1_components[cols_to_rescale].apply(
        lambda col: 10 * (col - col.min()) / (col.max() - col.min()))
    p2_components = pd.read_csv(p(cfg['paths']['p2_group_mean_csv']))

    # P2 missing value %
    exclude_cols = ['iso3', 'P2_arithmetic_avg', 'rank_reverse']
    cols_to_check = [c for c in p2_exposure_file.columns if c not in exclude_cols]
    p2_exposure_file['P2_missing_val'] = p2_exposure_file[cols_to_check].isna().mean(axis=1) * 100

    # Rename P1 abs/rel columns
    p1_exposure_file.columns = [
        c.replace('_absolute', '_abs_norm').replace('_relative', '_rel_norm')
        for c in p1_exposure_file.columns]

    # Merge P1 + P2 scores
    merged_P = p1_exposure_file.merge(p2_exposure_file, on='iso3', how='left')
    all_P    = merged_P.merge(p1p2_scores, on='iso3', how='left')
    all_P    = all_P.drop(columns=['P2_arithmetic_avg_y', 'rank_reverse_x'])
    all_P    = all_P.rename(columns={'P2_arithmetic_avg_x': 'P2_arithmetic_avg',
                                     'rank_reverse_y': 'rank_reverse'})

    # WB income
    wb_income = wb_income[['Region_Code', 'ISO3Code']]
    wb_income['Region_Code'] = wb_income['Region_Code'].str.extract(r'WB_(.*)')
    df = all_P.merge(wb_income, left_on='iso3', right_on='ISO3Code', how='left') \
              .drop('ISO3Code', axis=1).rename(columns={'Region_Code': 'wb_income'})

    # UNICEF RO
    unicef_ro = unicef_ro[['Region_Code', 'ISO3Code']]
    unicef_ro['Region_Code'] = unicef_ro['Region_Code'].str.extract(r'UNICEF_(.*)')
    df = df.merge(unicef_ro, left_on='iso3', right_on='ISO3Code', how='left') \
           .drop('ISO3Code', axis=1).rename(columns={'Region_Code': 'unicef_ro'})

    # Population from p1_p2_avg_ccri geojson
    gdf = gpd.read_file(p(cfg['paths']['p1_p2_avg_geojson']))
    pop_cols = [c for c in ['ISO3', 'child_population_total', 'population_total'] if c in gdf.columns]
    df_grouped = gdf[pop_cols].groupby('ISO3', as_index=False).mean()
    df_w_childpop = df.merge(df_grouped, left_on='iso3', right_on='ISO3', how='left') \
                      .rename(columns={'child_population_total': 'u18_pop'})
    if 'ISO3' in df_w_childpop.columns:
        df_w_childpop = df_w_childpop.drop(columns=['ISO3'])

    df_w_childpop = df_w_childpop.rename(columns={'iso3': 'ISO3'})

    # Simplified boundaries — dissolve all parts per ISO3 to avoid empty areas
    adm0 = adm0[['ISO3', 'name', 'ucode', 'uuid', 'geometry', 'type']]

    # For attributes, prefer the 'State' row per ISO3 if one exists; fall back to first row
    adm0_sorted = adm0.sort_values(
        by='type',
        key=lambda col: col.map(lambda t: 0 if t == 'State' else 1)
    )
    adm0_attrs = adm0_sorted.drop_duplicates(subset=['ISO3'], keep='first')[['ISO3', 'name', 'ucode', 'uuid', 'type']]

    # Union all geometries per ISO3 regardless of type
    adm0_geom = adm0[['ISO3', 'geometry']].copy()
    adm0_geom['geometry'] = adm0_geom['geometry'].make_valid()
    adm0_geom = adm0_geom.dissolve(by='ISO3').reset_index()

    adm0_unique = adm0_attrs.merge(adm0_geom, on='ISO3', how='left')

    # Keep all entity types except Antarctica
    adm0_unique = adm0_unique[adm0_unique['type'] != 'Antarctica']
    df_combined = gpd.GeoDataFrame(
        adm0_unique.merge(df_w_childpop, on='ISO3', how='left'),
        geometry='geometry', crs='EPSG:4326'
    )

    # Actual hazard exposure numbers from raw file
    # Use the full adm0 (not simplified) for ucode->ISO3 mapping — ucodes must match the exposure file
    adm0_full  = gpd.read_file(p(cfg['paths']['adm0_geojson']))[['ucode', 'ISO3']].drop_duplicates()
    exp_df = pd.read_csv(p(cfg['paths']['hazard_exposure_csv']))
    exp_df = exp_df.merge(adm0_full, on='ucode', how='inner')
    exp_df = exp_df.groupby('ISO3').sum(numeric_only=True, min_count=1).reset_index()

    zero_fill_raw = set(cfg['pillar1']['zero_fill_cols'])
    hazard_cols   = [c for c in exp_df.columns if c.startswith('pop_exposed_') and 'topic' not in c]
    exp_out = exp_df[['ISO3']].copy()
    exp_out['total_pop'] = exp_df['pop_total'].values

    for col in hazard_cols:
        clean_name  = col.replace('pop_exposed_', '')
        hazard_name = '_'.join(clean_name.split('_')[:2])
        values = exp_df[col].fillna(0) if col in zero_fill_raw else exp_df[col]
        exp_out[f'{hazard_name}_abs'] = values.values
        exp_out[f'{hazard_name}_rel'] = np.where(
            (exp_df['pop_child_total'] > 0) & exp_df['pop_child_total'].notna(),
            (values / exp_df['pop_child_total']) * 100, 0)

    df_combined = df_combined.merge(exp_out, on='ISO3', how='left')

    # Topic exposures
    topic_out = exp_df[['ISO3']].copy()
    for col in [c for c in exp_df.columns if c.startswith('pop_exposed_') and 'topic' in c]:
        topic_name = col.replace('pop_exposed_', '')
        topic_out[f'{topic_name}_abs'] = exp_df[col].values
        topic_out[f'{topic_name}_rel'] = np.where(
            (exp_df['pop_child_total'] > 0) & exp_df['pop_child_total'].notna(),
            (exp_df[col] / exp_df['pop_child_total']) * 100, 0)
    for i in range(1, 9):
        col = f'pop_topic_ge_{i}'
        if col in exp_df.columns:
            topic_out[f'ge_{i}_topic_abs'] = exp_df[col].values
            topic_out[f'ge_{i}_topic_rel'] = np.where(
                (exp_df['pop_child_total'] > 0) & exp_df['pop_child_total'].notna(),
                (exp_df[col] / exp_df['pop_child_total']) * 100, 0)
    df_combined = df_combined.merge(topic_out, on='ISO3', how='left')

    # Quadrant
    quad_table = pd.read_csv(p(cfg['paths']['quadrant_csv']))
    quad_table = quad_table.rename(columns={'Quadrant': 'CCRI_Quadrant'})
    df_combined = df_combined.merge(quad_table[['ISO3', 'CCRI_Quadrant']], on='ISO3', how='left')

    # Multi-hazard intensity from hazard exposure file
    mhi_out = exp_df[['ISO3']].copy()
    for pct in [75, 80, 85, 90, 95]:
        src_col = f'pop_mhi_p{pct}'
        if src_col in exp_df.columns:
            mhi_out[f'mhi_TH{pct}_abs'] = exp_df[src_col].values
            mhi_out[f'mhi_TH{pct}_rel'] = np.where(
                (exp_df['pop_child_total'] > 0) & exp_df['pop_child_total'].notna(),
                (exp_df[src_col] / exp_df['pop_child_total'] * 100).clip(upper=100), 0)
    df_combined = df_combined.merge(mhi_out, on='ISO3', how='left')

    # P2 raw values
    total_pop_df = exp_df[['ISO3', 'pop_child_total']].rename(
        columns={'pop_child_total': 'child_population_total'})
    total_pop_df = total_pop_df.groupby('ISO3', as_index=False).agg({'child_population_total': 'sum'})

    p2_vul_files = glob.glob(os.path.join(p(cfg['paths']['pillar2_data_dir']), '*.csv'))
    vul_data_list = []
    for file in p2_vul_files:
        df_vul = pd.read_csv(file)
        if 'time_period' in df_vul.columns:
            df_vul = df_vul[df_vul['time_period'] >= cfg['pillar2']['time_period_min']]
        if 'iso3' not in df_vul.columns or 'obs_value' not in df_vul.columns:
            continue
        df_vul = df_vul[['iso3', 'obs_value']].dropna()
        df_vul = df_vul.rename(columns={'iso3': 'ISO3'})
        hazard_name = os.path.basename(file).replace('.csv', '')
        if hazard_name == 'P2_Child_Mortality':
            continue
        df_vul = df_vul.merge(total_pop_df, on='ISO3', how='left')
        df_vul[hazard_name] = np.where(
            (df_vul['child_population_total'] > 0) & df_vul['child_population_total'].notna(),
            df_vul['obs_value'], 0)
        df_vul = df_vul.drop(columns=['child_population_total', 'obs_value'], errors='ignore')
        vul_data_list.append(df_vul)

    for vul_df in vul_data_list:
        df_combined = df_combined.merge(vul_df, on='ISO3', how='left')

    # Fragile
    fragile['fragile'] = 'fragile'
    df_combined = df_combined.merge(fragile[['ISO3', 'fragile']], on='ISO3', how='left')

    # SIDS and LLDC categorical columns (ISO3 not yet renamed to iso3 at this point)
    sids_set = set(cfg['sids_iso3'])
    lldc_set = set(cfg.get('lldc_iso3', []))
    df_combined['sids'] = df_combined['ISO3'].apply(lambda x: 'SIDS' if x in sids_set else None)
    df_combined['lldc'] = df_combined['ISO3'].apply(lambda x: 'LLDC' if x in lldc_set else None)

    # P1 + P2 components
    p1_components = p1_components.rename(columns=fmt_cfg['p1_component_renames'])
    p2_components = p2_components.rename(columns=fmt_cfg['p2_component_renames'])
    df_combined = df_combined.merge(p1_components, left_on='ISO3', right_on='iso3', how='left')
    df_combined = df_combined.merge(p2_components, left_on='ISO3', right_on='iso3', how='left')
    df_combined = df_combined.drop(df_combined.filter(regex='max|min').columns, axis=1)
    df_combined = df_combined.rename(columns={'name': 'adm_name', 'P1_P2_geometric_avg': 'ccri'})

    # Round numeric columns to 2 dp
    for col in df_combined.columns:
        if col not in ['wb_income', 'unicef_ro', 'geometry', 'fragile']:
            if col in df_combined.select_dtypes(include='number').columns:
                df_combined[col] = df_combined[col].round(2)

    # Column name cleanup
    df_combined.columns = [c.replace('_normalized', '_norm').replace('value_norm', 'norm')
                           for c in df_combined.columns]

    # P1 hazard abbreviations
    for old, new in fmt_cfg['p1_col_renames'].items():
        df_combined.columns = [c.replace(old, new) if old in c else c for c in df_combined.columns]

    # P2 indicator abbreviations
    for old, new in fmt_cfg['p2_col_renames'].items():
        df_combined.columns = [c.replace(old, new) if old in c else c for c in df_combined.columns]

    # ge_* → mhc_ge*
    rename_ge = {f'ge_{i}_topic_abs': f'mhc_ge{i}_abs' for i in range(1, 9)}
    rename_ge.update({f'ge_{i}_topic_rel': f'mhc_ge{i}_rel' for i in range(1, 9)})
    df_combined = df_combined.rename(columns=rename_ge)

    # Finalize
    df_combined = df_combined.rename(columns={'ISO3': 'iso3'})

    # Cap mhi abs columns at u18_pop
    for col in fmt_cfg['mhi_abs_cols']:
        if col in df_combined.columns:
            df_combined[col] = np.minimum(df_combined[col], df_combined['u18_pop'])

    # Force P1 overall null for specific countries (individual hazard scores kept)
    for iso3_code in fmt_cfg.get('force_null_p1', []):
        mask = df_combined['iso3'] == iso3_code
        for col in df_combined.columns:
            if col.startswith('P1_'):
                df_combined.loc[mask, col] = np.nan

    # Force P2 overall null for specific countries (individual P2 indicators kept)
    for iso3_code in fmt_cfg.get('force_null_p2_overall', []):
        mask = df_combined['iso3'] == iso3_code
        if 'P2_arithmetic_avg' in df_combined.columns:
            df_combined.loc[mask, 'P2_arithmetic_avg'] = np.nan

    # Null MHI and MHC for countries where P1 is null (any hazard forced null propagates here)
    mhi_mhc_cols = [c for c in df_combined.columns if c.startswith('mhi_') or c.startswith('mhc_')]
    df_combined.loc[df_combined['P1_geometric_avg'].isna(), mhi_mhc_cols] = np.nan

    # Null all data for Sovereignty unsettled entities
    sov_mask = df_combined['type'] == 'Sovereignty unsettled'
    id_cols_sov = {'iso3', 'adm_name', 'wb_income', 'unicef_ro', 'ucode', 'uuid', 'geometry', 'type'}
    for col in df_combined.columns:
        if col not in id_cols_sov:
            df_combined.loc[sov_mask, col] = np.nan

    # For non-State/Territory entities: keep raw exposure (abs/rel) but null all scores/normalized columns
    territory_types = {'Non-Self Governing Territory', 'Self Governing Territory', 'Special Region or Province'}
    territory_mask = df_combined['type'].isin(territory_types)
    score_cols = [c for c in df_combined.columns if
                  c.endswith('_norm') or c.endswith('_abs_norm') or c.endswith('_rel_norm')
                  or c.startswith('P1_') or c.startswith('P2_')
                  or c.startswith('mhi_') or c.startswith('mhc_')]
    for col in score_cols:
        df_combined.loc[territory_mask, col] = np.nan

    # Null raw abs/rel exposure columns for force_null countries (mirrors P1 normalized nulls)
    p1_short = fmt_cfg['p1_col_renames']
    for iso3_code, cols in cfg['pillar1'].get('force_null', {}).items():
        mask = df_combined['iso3'] == iso3_code
        seen_groups = set()
        for col in cols:
            group = col.replace('_absolute', '').replace('_relative', '')
            if group in seen_groups:
                continue
            seen_groups.add(group)
            short = p1_short.get(group)
            if short:
                for suffix in ['_abs', '_rel']:
                    raw_col = f'{short}{suffix}'
                    if raw_col in df_combined.columns:
                        df_combined.loc[mask, raw_col] = np.nan

    # For excluded countries: keep rows in the output but null all analytical columns
    id_cols = {'iso3', 'adm_name', 'total_pop', 'u18_pop', 'wb_income', 'unicef_ro',
               'ucode', 'uuid', 'geometry', 'type', 'fragile', 'sids', 'lldc'}
    data_cols = [c for c in df_combined.columns if c not in id_cols]
    df_combined.loc[df_combined['iso3'].isin(exclude_iso3), data_cols] = np.nan

    # Drop ccri (keep CCRI_Quadrant, P1, P2 scores)
    df_combined = df_combined.drop(columns=['ccri'], errors='ignore')

    # Convert abs columns to nullable integer (preserves NaN for hazards with no data)
    zero_fill_hazards = {
        '_'.join(c.replace('pop_exposed_', '').split('_')[:2])
        for c in cfg['pillar1']['zero_fill_cols']
    }
    for col in df_combined.columns:
        if 'abs' in col and 'norm' not in col:
            hazard_prefix = col.replace('_abs', '').replace('_rel', '')
            if any(col.startswith(h) for h in zero_fill_hazards):
                df_combined[col] = df_combined[col].fillna(0).astype('Int64')
            else:
                df_combined[col] = pd.to_numeric(df_combined[col], errors='coerce') \
                                     .round(0).astype('Int64')

    # Round population columns
    for pop_col in ['total_pop', 'u18_pop']:
        if pop_col in df_combined.columns:
            df_combined[pop_col] = pd.to_numeric(
                df_combined[pop_col].round(0), errors='coerce').astype('Int64')

    # Drop duplicate iso3 columns from multi-merge
    iso3_dupes = [c for c in df_combined.columns if c == 'iso3']
    if len(iso3_dupes) > 1:
        df_combined = df_combined.loc[:, ~df_combined.columns.duplicated()]

    # Select final columns (keep only those that exist)
    final_cols = [c for c in fmt_cfg['output_columns'] if c in df_combined.columns]
    df_combined = df_combined[final_cols]

    gdf = gpd.GeoDataFrame(df_combined, geometry=df_combined['geometry'], crs='EPSG:4326')
    gdf.to_file(p(cfg['paths']['ccri_format_geojson']), driver='GeoJSON')
    print(f"  -> {cfg['paths']['ccri_format_geojson']}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    run_pillar1()
    run_pillar2()
    run_aggregation()
    run_quadrant()
    run_formatting()
    print("Pipeline complete.")
