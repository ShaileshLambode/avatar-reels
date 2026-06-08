import os
import requests

# Create directories
os.makedirs("models/musetalk", exist_ok=True)
os.makedirs("models/musetalkV15", exist_ok=True)
os.makedirs("models/sd-vae-ft-mse", exist_ok=True)
os.makedirs("models/dwpose", exist_ok=True)
os.makedirs("models/face-parse-bisent", exist_ok=True)
os.makedirs("models/whisper", exist_ok=True)

# Define urls to download
urls = {
    "models/musetalk/musetalk.json": "https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalk/musetalk.json",
    "models/musetalk/pytorch_model.bin": "https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalk/pytorch_model.bin",
    "models/musetalkV15/musetalk.json": "https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalkV15/musetalk.json",
    "models/musetalkV15/unet.pth": "https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalkV15/unet.pth",
    "models/sd-vae-ft-mse/config.json": "https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/config.json",
    "models/sd-vae-ft-mse/diffusion_pytorch_model.bin": "https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/diffusion_pytorch_model.bin",
    "models/dwpose/dw-ll_ucoco_384.pth": "https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ll_ucoco_384.pth",
    "models/face-parse-bisent/79999_iter.pth": "https://huggingface.co/ManyOtherFunctions/face-parse-bisent/resolve/main/79999_iter.pth",
    "models/face-parse-bisent/resnet18-5c106cde.pth": "https://download.pytorch.org/models/resnet18-5c106cde.pth",
    "models/whisper/tiny.pt": "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt"
}

def download_file(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        print(f"{path} already exists and is non-empty. Skipping download.")
        return
    
    # Apply HF_ENDPOINT mirror if configured
    endpoint = os.environ.get("HF_ENDPOINT", "").strip().rstrip("/")
    if endpoint and "huggingface.co" not in endpoint:
        url = url.replace("https://huggingface.co", endpoint)
        
    print(f"Downloading {url} to {path}...")
    
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            with requests.get(url, headers=headers, stream=True, allow_redirects=True) as response:
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                bytes_so_far = 0
                chunk_size = 1024 * 1024  # 1MB chunks
                
                with open(path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            bytes_so_far += len(chunk)
                            if total_size > 0:
                                percent = bytes_so_far * 1e2 / total_size
                                print(f"\rProgress: {percent:.1f}% ({bytes_so_far / 1024 / 1024:.1f} MB of {total_size / 1024 / 1024:.1f} MB)", end="")
                            else:
                                print(f"\rDownloaded {bytes_so_far / 1024 / 1024:.1f} MB", end="")
            print("\nDownload complete.")
            return
        except Exception as e:
            print(f"\nError downloading {url}: {str(e)}")
            if attempt < max_retries - 1:
                print("Waiting 5 seconds before retrying...")
                time.sleep(5)
            else:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except:
                        pass
                raise e

for path, url in urls.items():
    download_file(url, path)

print("All models downloaded successfully.")
