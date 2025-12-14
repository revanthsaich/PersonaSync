import cv2
import numpy as np
import requests

def load_image_from_url(url: str):
    r = requests.get(url, timeout=10)
    arr = np.frombuffer(r.content, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
