# Recorte de prendas (SlimSAM)

Modelo [SlimSAM-77-uniform](https://huggingface.co/nielsr/slimsam-77-uniform), versión podada de Segment Anything (Meta), licencia Apache-2.0, en la exportación ONNX cuantizada de [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform), sin modificar:

- `encoder.onnx`: `onnx/vision_encoder_quantized.onnx` (imagen de 1024 px → mapa de rasgos).
- `decoder.onnx`: `onnx/prompt_encoder_mask_decoder_quantized.onnx` (puntos → tres máscaras candidatas).

La app le indica dónde está cada prenda con puntos sacados de la cabeza de segmentación propia (`src/ai/segmentation.ts`) y elige la máscara que mejor coincide con esa zona.
