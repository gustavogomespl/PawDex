# PawDex ML API

## Local setup

Install the CPU torch wheels from the PyTorch index first, then install the regular API dependencies:

```bash
.venv/bin/pip install -r requirements-torch.txt
.venv/bin/pip install -r requirements.txt
```

Pre-cache the MobileNetV3 weights locally so the first real request does not download them:

```bash
.venv/bin/python -c "from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small; mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)"
```

Docker installs torch/torchvision separately and pre-caches the same weights during image build.
