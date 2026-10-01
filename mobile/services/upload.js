import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl } from './apiConfig';

/** POST a photo to a multipart endpoint (`/predict`, `/ocr`) and return the parsed JSON. */
export async function uploadImage(path, imageUri, { unreachable } = {}) {
  let upload;
  try {
    upload = await FileSystem.uploadAsync(`${getApiUrl()}${path}`, imageUri, {
      fieldName: 'image',
      httpMethod: 'POST',
      mimeType: 'image/jpeg',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      headers: { Accept: 'application/json' }
    });
  } catch {
    // Always name the address that was tried: a stale saved override or a changed LAN
    // address is the usual reason a phone cannot reach the server.
    throw new Error(
      `${
        unreachable ||
        'Cannot reach the E-REF server. Start it with "uvicorn backend.server:app --host 0.0.0.0 --port 8000".'
      } (Tried ${getApiUrl()}.)`
    );
  }

  let payload;
  try {
    payload = JSON.parse(upload.body);
  } catch {
    throw new Error(`Unexpected response from the server (HTTP ${upload.status}).`);
  }

  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The server could not process that photo.');
  }
  return payload;
}
