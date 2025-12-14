# ---------- Imports ----------
import cv2
import numpy as np
from insightface.app import FaceAnalysis

# ---------- 1. Initialize InsightFace ----------
app = FaceAnalysis(name="buffalo_l")
app.prepare(ctx_id=0)  # use ctx_id=-1 for CPU

# ---------- 2. Face Quality Check ----------

def is_face_good_quality(image, bbox):
    x1, y1, x2, y2 = map(int, bbox)

    h, w, _ = image.shape
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    face = image[y1:y2, x1:x2]
    if face.size == 0:
        return False

    fh, fw, _ = face.shape
    if fh < 50 or fw < 50:
        return False

    gray = cv2.cvtColor(face, cv2.COLOR_RGB2GRAY)

    blur = cv2.Laplacian(gray, cv2.CV_64F).var()
    if blur < 80:
        return False

    brightness = np.mean(gray)
    if brightness < 60 or brightness > 220:
        return False

    contrast = gray.std()
    if contrast < 25:
        return False

    return True

# ---------- 3. Extract Faces + Embeddings ----------

def extract_faces_and_embeddings(image):
    faces = app.get(image)
    results = []

    for i, face in enumerate(faces):
        # if not is_face_good_quality(image, face.bbox):
        #     continue

        emb = face.embedding
        emb = emb / np.linalg.norm(emb)

        results.append({
            "face_index": i,
            "embedding": emb,
            "bbox": face.bbox
        })

    return results

# ---------- 4. Main ML Logic ----------

MATCH_THRESHOLD = 0.45

def process_image_in_memory_space(image, person_stats):
    """
    image        : RGB image (numpy array)
    person_stats : {
        person_id: {
            centroid: np.array,
            count: int
        }
    }
    """

    faces = extract_faces_and_embeddings(image)
    results = []

    for face in faces:
        emb = face["embedding"]

        best_person = None
        best_score = -1

        for pid, data in person_stats.items():
            score = np.dot(emb, data["centroid"])
            if score > best_score:
                best_score = score
                best_person = pid

        if best_score >= MATCH_THRESHOLD:
            data = person_stats[best_person]
            data["centroid"] = (
                data["centroid"] * data["count"] + emb
            ) / (data["count"] + 1)
            data["count"] += 1
            person_id = best_person
        else:
            person_id = f"person_{len(person_stats)}"
            person_stats[person_id] = {
                "centroid": emb,
                "count": 1
            }

        results.append({
            "face_index": face["face_index"],
            "person_id": person_id,
            "confidence": round(best_score, 3),
            "bbox": face["bbox"].tolist()
        })

    return results, person_stats
