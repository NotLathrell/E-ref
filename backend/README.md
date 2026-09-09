# FoodFresh inference API

This server loads the trained model at `runs/classify/runs/classify/freshness/weights/best.pt` by default.
You can provide another model with the `FOOD_MODEL_PATH` environment variable.
The model can be a Ultralytics YOLO classifier or detector. Its class names are read from the model, so the labels must match the dataset used for training.

```powershell
cd C:\Users\mrjha\Downloads\E-REF\EREF
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Check the server at `http://PC_LAN_IP:8000/health`.
The Expo app sends captured images to the server automatically when started with `npm.cmd start` from `mobile`.

Once the server is running, the camera screen uploads captured images to `/predict` automatically. Check `/health` first; it should return `"ready": true` and the path to `best.pt`.
