import json
import os
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) != 2:
        raise ValueError("Falta la ruta del audio")

    # "small" y no "base". Con base, los audios de los clientes salían así:
    #
    #     "¿Cuánto cueste lo mito modo sabor?"   ← el lomito Modo Sabor
    #     "Tiene mil pesos cual está el fico"    ← el chico
    #     "¿Cuál es el estado de mi periodo?"    ← mi pedido
    #
    # La IA recibe eso y contesta cualquier cosa. Es la diferencia entre un
    # audio que sirve y uno que hace perder al cliente.
    #
    # Se pone acá como valor por defecto y también se precarga en la imagen de
    # Railway. Así el gateway no depende de una PC del local ni intenta bajar
    # cientos de MB mientras un cliente espera la respuesta al primer audio.
    #
    # Cuesta unos segundos más por audio. Frente a contestar mal, sobra.
    model_name = os.environ.get("WHISPER_MODEL", "small").strip() or "small"
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
