import json
import os
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) != 2:
        raise ValueError("Falta la ruta del audio")

    model_name = os.environ.get("WHISPER_MODEL", "base").strip() or "base"
    cache_dir = os.environ.get("WHISPER_CACHE_DIR", "").strip() or None
    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=cache_dir,
    )
    segments, info = model.transcribe(
        sys.argv[1],
        language="es",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
        initial_prompt=os.environ.get(
            "WHISPER_INITIAL_PROMPT",
            "Modo Sabor, lomito, hamburguesa, milanesa, pizza, cremoso, muzza, "
            "empanadas, salchipapas, cheddar, Roquefort, delivery, Monteros, Tucumán",
        ),
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    print(json.dumps({"text": text, "language": info.language}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
