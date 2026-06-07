import os
import urllib.request
from huggingface_hub import snapshot_download

# Create directories
os.makedirs("models/dwpose", exist_ok=True)
os.makedirs("models/face-parse-bisent", exist_ok=True)
os.makedirs("models/whisper", exist_ok=True)

print("Downloading MuseTalk model snapshot from Hugging Face...")
snapshot_download(repo_id='TMElyralab/MuseTalk', local_dir='./models/musetalk', ignore_patterns=["*.git*", "*.gitattributes"])

print("Downloading SD VAE ft-mse snapshot from Hugging Face...")
snapshot_download(repo_id='stabilityai/sd-vae-ft-mse', local_dir='./models/sd-vae-ft-mse', ignore_patterns=["*.git*", "*.gitattributes"])

# Define urls to download
urls = {
    "models/dwpose/dw-ll_ucoco_384.pth": "https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ll_ucoco_384.pth",
    "models/face-parse-bisent/79999_iter.pth": "https://huggingface.co/ManyOtherFunctions/face-parse-bisent/resolve/main/79999_iter.pth",
    "models/face-parse-bisent/resnet18-5c106cde.pth": "https://download.pytorch.org/models/resnet18-5c106cde.pth",
    "models/whisper/tiny.pt": "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt"
}

def download_file(url, path):
    if os.path.exists(path):
        print(f"{path} already exists. Skipping download.")
        return
    print(f"Downloading {url} to {path}...")
    
    # Custom progress bar
    def reporthook(blocknum, blocksize, totalsize):
        readsofar = blocknum * blocksize
        if totalsize > 0:
            percent = readsofar * 1e2 / totalsize
            s = f"\rProgress: {percent:.1f}% ({readsofar / 1024 / 1024:.1f} MB of {totalsize / 1024 / 1024:.1f} MB)"
            print(s, end="")
        else:
            print(f"\rDownloaded {readsofar / 1024 / 1024:.1f} MB", end="")
            
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            urllib.request.urlretrieve(url, path, reporthook)
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
