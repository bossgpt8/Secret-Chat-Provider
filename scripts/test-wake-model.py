"""Real-model diagnostic; requires Python sherpa-onnx 2.0.1 and sentencepiece.

Without --wav, validates the engine with its official human-speech fixture.
With --wav, checks an actual recording saying "Hey <name>" (mono PCM16 WAV).
This is not a substitute for physical phone/background/battery validation.
"""
import argparse
import array
import pathlib
import tempfile
import wave

import sherpa_onnx
import sentencepiece


def detect(model, keywords, audio):
    with wave.open(str(audio)) as wav:
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
        rate = wav.getframerate()
        samples = array.array("h", wav.readframes(wav.getnframes()))
    spotter = sherpa_onnx.KeywordSpotter(
        tokens=str(model / "tokens.txt"),
        encoder=str(model / "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        decoder=str(model / "decoder-epoch-12-avg-2-chunk-16-left-64.onnx"),
        joiner=str(model / "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        num_threads=1,
        keywords_file=str(keywords),
        keywords_score=1.5,
        keywords_threshold=0.35,
        num_trailing_blanks=2,
    )
    stream = spotter.create_stream()
    values = [sample / 32768.0 for sample in samples] + [0.0] * rate
    found = []
    for start in range(0, len(values), rate // 10):
        stream.accept_waveform(rate, values[start : start + rate // 10])
        while spotter.is_ready(stream):
            spotter.decode_stream(stream)
            result = spotter.get_result(stream)
            if result:
                found.append(result)
                spotter.reset_stream(stream)
    return found


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=pathlib.Path)
    parser.add_argument("--wav", type=pathlib.Path)
    parser.add_argument("--name", default="Vox")
    args = parser.parse_args()
    model = args.model.resolve()
    with tempfile.TemporaryDirectory() as tmp:
        directory = pathlib.Path(tmp)
        keywords = directory / "keywords.txt"
        processor = sentencepiece.SentencePieceProcessor(model_file=str(model / "bpe.model"))
        normalized = " ".join(("HEY " + args.name.replace(".", "").replace("-", " ")).upper().split())
        pieces = processor.encode(normalized, out_type=str)
        keywords.write_text(" ".join(pieces) + " @ASSISTANT_WAKE\n", encoding="utf-8")
        if args.wav:
            result = detect(model, keywords, args.wav)
            assert "ASSISTANT_WAKE" in result, f"Wake phrase not detected in supplied recording: {result}"
            print(f"PASS: Hey {args.name} detected in supplied recording.")
        else:
            sample = model / "test_wavs/0.wav"
            # This fixture says LIGHT UP, not Hey Vox; it must not trigger the configured name.
            assert not detect(model, keywords, sample)
            keywords.write_text("▁ L IGHT ▁UP @ASSISTANT_WAKE\n", encoding="utf-8")
            assert "ASSISTANT_WAKE" in detect(model, keywords, sample)
            print("PASS: official human speech detected with correct keyword and rejected for a different keyword.")
    print("Runtime smoke check passed. Actual name/accent and physical phone validation remain separate.")
