# Pose y partes del cuerpo (MediaPipe)

Modelos de [MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) (Google), licencia Apache-2.0 según sus fichas oficiales, descargados de `storage.googleapis.com/mediapipe-models` con la versión fijada y sin modificar:

- `pose_landmarker_full.task`: Pose Landmarker (BlazePose GHUM 3D), `pose_landmarker/pose_landmarker_full/float16/1/`. Ficha: [Model Card BlazePose GHUM 3D](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) («LICENSED UNDER Apache License, Version 2.0»). SHA-256 `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1`.
- `selfie_multiclass_256x256.tflite`: segmentación multiclase de personas (fondo, pelo, piel del cuerpo, piel de la cara, ropa, otros), `image_segmenter/selfie_multiclass_256x256/float32/1/`. Ficha: [Model Card Multiclass Segmentation](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) («LICENSED UNDER Apache License, Version 2.0», Adel Ahmadyan, Google, 10-05-2023). SHA-256 `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`.

El motor es [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.2.2 (Apache-2.0); su WebAssembly se sirve desde el propio origen. Las dos fichas dejan fuera de su uso la vigilancia y el reconocimiento de identidad; la de la pose, además, varias personas en la foto o la cabeza fuera de ella. Molt solo los usa en el dispositivo para localizar y recortar la ropa de una foto de cuerpo entero («Desde un look»).

Copyright Google LLC. Licensed under the Apache License, Version 2.0: <https://www.apache.org/licenses/LICENSE-2.0>.
