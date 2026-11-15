"""Portfolio, thesis lines and shared paths. Edit here, nowhere else."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# 10 stocks, mixed sectors and caps. `thesis.metric` is checked by code against the latest quarter.
# metric keys: ebitda_margin | pat_margin | revenue_yoy | pat_yoy   (all in %, computed by code)
PORTFOLIO = [
    {"symbol": "RELIANCE", "name": "Reliance Industries", "sector": "Energy & Telecom", "cap": "Large",
     "thesis": {"why": "Jio and Retail compound while O2C funds them", "metric": "ebitda_margin", "op": ">=", "value": 15}},
    {"symbol": "HDFCBANK", "name": "HDFC Bank", "sector": "Banking", "cap": "Large",
     "thesis": {"why": "Lowest-cost deposit franchise; earnings compound post-merger", "metric": "pat_yoy", "op": ">=", "value": 8}},
    {"symbol": "TCS", "name": "Tata Consultancy Services", "sector": "IT Services", "cap": "Large",
     "thesis": {"why": "Best-in-class margins and cash return", "metric": "ebitda_margin", "op": ">=", "value": 25}},
    {"symbol": "SUNPHARMA", "name": "Sun Pharmaceutical", "sector": "Pharma", "cap": "Large",
     "thesis": {"why": "Global specialty portfolio lifts the margin mix", "metric": "ebitda_margin", "op": ">=", "value": 26}},
    {"symbol": "ASIANPAINT", "name": "Asian Paints", "sector": "Paints", "cap": "Large",
     "thesis": {"why": "Distribution moat holds margins despite new entrants", "metric": "ebitda_margin", "op": ">=", "value": 18}},
    {"symbol": "DIXON", "name": "Dixon Technologies", "sector": "Electronics Mfg", "cap": "Mid",
     "thesis": {"why": "PLI-led scale-up in phones and components", "metric": "revenue_yoy", "op": ">=", "value": 25}},
    {"symbol": "POLYCAB", "name": "Polycab India", "sector": "Cables & Wires", "cap": "Mid",
     "thesis": {"why": "Capex and housing cycle drive volume; FMEG turning profitable", "metric": "ebitda_margin", "op": ">=", "value": 12}},
    {"symbol": "PERSISTENT", "name": "Persistent Systems", "sector": "IT Services", "cap": "Mid",
     "thesis": {"why": "Fastest-growing mid-tier IT name", "metric": "revenue_yoy", "op": ">=", "value": 18}},
    {"symbol": "DEEPAKNTR", "name": "Deepak Nitrite", "sector": "Chemicals", "cap": "Mid",
     "thesis": {"why": "Phenol/acetone integration restores margins", "metric": "ebitda_margin", "op": ">=", "value": 14}},
    {"symbol": "CAMPUS", "name": "Campus Activewear", "sector": "Footwear", "cap": "Small",
     "thesis": {"why": "Value sports footwear gaining share", "metric": "revenue_yoy", "op": ">=", "value": 10}},
]

# Tickers with a precomputed promise tracker (2-3, per scope).
PROMISE_TICKERS = ["POLYCAB", "PERSISTENT", "DIXON"]
