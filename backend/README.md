# FoodFresh inference API

This server loads the trained food freshness classifier at
`runs/classify/runs/classify/food_multiclass/weights/best.pt` by default. The weights are
the YOLO multiclass classification model trained from the prepared dataset in
`Datasets/dataset/Train` and `Datasets/dataset/Test`.
You can provide another model with the `FOOD_MODEL_PATH` environment variable.
The model can be a Ultralytics YOLO classifier or detector. Its class names are read from the model, so the labels must match the dataset used for training.

The API normalizes food-bearing dataset labels such as `freshbanana` and
`rottenapples` into catalog food names while preserving freshness in the response.
The multiclass response returns food identity and freshness together, for
example `fresh_banana` becomes `banana` with freshness `fresh`.

```powershell
cd C:\Users\Lathrell\Downloads\EREF
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Check the server at `http://PC_LAN_IP:8000/health`.
The Expo app sends captured images to the server automatically when started with `npm.cmd start` from `mobile`.

Once the server is running, the camera screen uploads captured images to `/predict` automatically. Check `/health` first; it should return `"ready": true` and the path to `best.pt`.
