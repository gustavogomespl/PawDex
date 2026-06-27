# PawDex ML API

## Local setup

Install the regular API dependencies first, then install the CPU torch wheels from the PyTorch index:

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r requirements-torch.txt
```

Docker installs torch/torchvision separately and pre-caches the MobileNetV3 weights during image build.
