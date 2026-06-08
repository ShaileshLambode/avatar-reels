import os
import requests

os.makedirs("models/whisper", exist_ok=True)

files = [
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "pytorch_model.bin",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt",
    "normalizer.json",
    "added_tokens.json"
]

base_url = "https://hf-mirror.com/openai/whisper-tiny/resolve/main/"

for file in files:
    url = base_url + file
    path = os.path.join("models/whisper", file)
    print(f"Downloading {url} to {path}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        r = requests.get(url, headers=headers, stream=True)
        r.raise_for_status()
        with open(path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print("Success.")
    except Exception as e:
        print(f"Failed to download {file}: {e}")
