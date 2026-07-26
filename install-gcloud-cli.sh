#!/usr/bin/env bash
set -euo pipefail

sudo mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
curl -fsSL -o /tmp/google-cloud-apt-key.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
sudo gpg --dearmor --yes --output /usr/share/keyrings/cloud.google.gpg /tmp/google-cloud-apt-key.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' \
  | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list >/dev/null
sudo apt-get update
sudo apt-get install -y google-cloud-cli
gcloud --version
