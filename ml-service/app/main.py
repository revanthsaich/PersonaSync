from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

from app.utils import load_image_from_url
from app.state import user_spaces
from app.ml_core import process_image_in_memory_space

app = FastAPI(title="PersonaSync ML Service")

@app.get("/")
def read_root():
    return {"message": "PersonaSync ML Service is running. Visit /docs for API documentation."}

# ---------- Request / Response ----------

class ImageRequest(BaseModel):
    user_id: str
    image_url: str

class FaceResult(BaseModel):
    face_index: int
    person_id: str
    confidence: float
    bbox: list
    face_image: str | None = None

class ProcessResponse(BaseModel):
    results: List[FaceResult]

# ---------- API ----------

@app.post("/process-image", response_model=ProcessResponse)
def process_image(req: ImageRequest):

    # 1️⃣ Get user memory
    if req.user_id not in user_spaces:
        user_spaces[req.user_id] = {}

    person_stats = user_spaces[req.user_id]

    # 2️⃣ Load image
    try:
        image = load_image_from_url(req.image_url)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image URL")

    # 3️⃣ Run ML (UNCHANGED LOGIC)
    results, updated_stats = process_image_in_memory_space(
        image,
        person_stats
    )

    # 4️⃣ Save memory
    user_spaces[req.user_id] = updated_stats

    return {"results": results}



@app.get("/debug/users")
def debug_users():
    summary = {}

    for user_id, person_stats in user_spaces.items():
        summary[user_id] = {
            "total_persons": len(person_stats),
            "persons": {
                pid: data["count"]
                for pid, data in person_stats.items()
            }
        }

    return summary
