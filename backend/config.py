from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data" / "processed"
ARTIFACT_DIR = ROOT_DIR / "artifacts" / "models"

# ViHSD (Vietnamese Hate Speech Detection) - UIT-VNUHCM, arXiv:2103.11528
# visolex/ViHSD is tried first since it's a public mirror requiring no auth;
# sonlam1102/vihsd and uitnlp/vihsd are gated on the HF Hub.
HF_DATASET_CANDIDATES = ["visolex/ViHSD", "sonlam1102/vihsd", "uitnlp/vihsd"]

MODEL_NAME = "vinai/phobert-base-v2"
MAX_LENGTH = 128
NUM_LABELS = 2
HIDDEN_DIM = 256
DROPOUT = 0.1
SEED = 42

# Fallback column names if auto-detection fails (per the ViHSD paper).
FALLBACK_TEXT_COL = "free_text"
FALLBACK_LABEL_COL = "label_id"

DATA_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)